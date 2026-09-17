/**
 * Every provider call in this app goes through here.
 *
 * Before Phase H, `llmCall` did `await model.invoke(...)` and, on failure,
 * logged and rethrew. That made a single 429 from OpenAI cost the user their
 * whole turn — and, because the quota reservation happens before the graph
 * runs, a message off their monthly allowance as well. Four things are layered
 * on here, in the order they matter:
 *
 *  1. **A deadline per attempt**, so a provider that never answers cannot hold
 *     the turn until `MAX_TURN_DURATION_MS` fires.
 *  2. **Bounded retries with full-jitter backoff**, so a transient blip is
 *     survived without synchronizing the whole fleet onto a struggling
 *     provider.
 *  3. **A circuit breaker per provider**, so once the outage is established,
 *     the next request is routed rather than spent re-proving it.
 *  4. **A fallback model on a different provider**, so the user gets an answer
 *     instead of a 500 — which is this phase's exit criterion.
 *
 * The arithmetic is pure and lives in `lib/ai/resilience-policy.ts`; the
 * breaker map is in `server/ai/provider-health.ts`; the error narrowing is in
 * `server/ai/provider-failure.ts`. This module is the orchestration and
 * nothing else, which is why every policy and both effects (`sleep`, `random`)
 * are injectable.
 */

import {
  fallbackModelId,
  MODEL_REGISTRY,
  registryProviders,
  type ModelId,
  type ModelProvider,
} from "@/lib/ai/model-registry";
import {
  backoffDelayMs,
  DEFAULT_BREAKER_POLICY,
  DEFAULT_RETRY_POLICY,
  shouldRetry,
  type BreakerPolicy,
  type RetryPolicy,
} from "@/lib/ai/resilience-policy";
import { toProviderFailure, type ProviderFailure } from "@/server/ai/provider-failure";
import {
  admitProviderCall,
  healthyProviders,
  recordProviderFailure,
  recordProviderSuccess,
} from "@/server/ai/provider-health";
import { AppError } from "@/server/lib/app-error";
import type { Logger } from "@/server/lib/logger";
import { withSpan } from "@/server/observability/tracing";

/**
 * The actual provider call, supplied by the caller so this module never
 * constructs a model or binds a tool. `timeoutMs` is passed through to the
 * SDK rather than raced against, so a timed-out attempt is genuinely
 * cancelled at the socket instead of abandoned while it keeps billing.
 */
export type ProviderCall<TResult> = (params: {
  readonly modelId: ModelId;
  readonly timeoutMs: number;
}) => Promise<TResult>;

export type ResilientCallOutcome<TResult> = {
  readonly result: TResult;
  /** The model that actually answered, which is not always the one asked for. */
  readonly modelId: ModelId;
  /** Null unless the breaker or an exhausted retry budget forced a different model. */
  readonly fallbackFrom: ModelId | null;
  /** Attempts across every model tried, so one number describes the whole call. */
  readonly attempts: number;
};

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    // A pending backoff must not keep a serverless invocation alive past the
    // work it was scheduled for — the same reason the turn deadline unrefs.
    timer.unref();
  });

export async function callModelWithResilience<TResult>(params: {
  readonly modelId: ModelId;
  readonly call: ProviderCall<TResult>;
  readonly log: Logger;
  /**
   * Providers this deployment holds a key for.
   *
   * Passed in rather than imported from `lib/env`, which validates the whole
   * process environment as an import side effect. Taking it as a parameter is
   * what lets this module — the one that decides whether a user gets an answer
   * during an outage — be exercised by a test with no environment at all.
   */
  readonly availableProviders: ReadonlySet<ModelProvider>;
  readonly retryPolicy?: RetryPolicy;
  readonly breakerPolicy?: BreakerPolicy;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly random?: () => number;
}): Promise<ResilientCallOutcome<TResult>> {
  const retryPolicy = params.retryPolicy ?? DEFAULT_RETRY_POLICY;
  const breakerPolicy = params.breakerPolicy ?? DEFAULT_BREAKER_POLICY;
  const sleep = params.sleep ?? defaultSleep;
  const random = params.random ?? Math.random;
  const now = params.now ?? (() => new Date());

  let attempts = 0;
  let lastFailure: ProviderFailure | null = null;

  for (const candidate of [params.modelId, null]) {
    // `null` is the marker for "now consider a fallback" — resolved here
    // rather than up front, because the healthy set has changed by this point:
    // the primary provider's breaker may have opened during the attempts above.
    const modelId =
      candidate ??
      fallbackModelId({
        modelId: params.modelId,
        available: params.availableProviders,
        healthy: healthyProviders(registryProviders()),
      });

    if (modelId === null) break;

    const provider = MODEL_REGISTRY[modelId].provider;
    const isFallback = modelId !== params.modelId;

    if (!admitProviderCall({ provider, now: now(), policy: breakerPolicy })) {
      params.log.warn("llm.provider_short_circuited", { provider, modelId, isFallback });
      lastFailure ??= toProviderFailure(
        new AppError(
          "SERVICE_UNAVAILABLE",
          "That model is temporarily unavailable. Please try again in a moment.",
          { cause: new Error(`Circuit breaker open for provider "${provider}".`) },
        ),
      );
      continue;
    }

    if (isFallback) {
      // Logged, not silent. A user whose answer came from a different model
      // than they picked deserves an explanation in the record even though the
      // turn succeeded, and an operator needs to see fallbacks rising.
      params.log.warn("llm.model_fallback", { from: params.modelId, to: modelId, provider });
    }

    const attempt = await runAttempts({
      modelId,
      provider,
      call: params.call,
      log: params.log,
      retryPolicy,
      breakerPolicy,
      now,
      sleep,
      random,
    });
    attempts += attempt.attempts;

    if (attempt.outcome === "succeeded") {
      return {
        result: attempt.result,
        modelId,
        fallbackFrom: isFallback ? params.modelId : null,
        attempts,
      };
    }

    lastFailure = attempt.failure;

    // An abort is the user stopping, or the turn deadline firing. Falling back
    // to another provider would restart work nobody is waiting for.
    if (attempt.failure.kind === "aborted") break;
    // A permanent failure is deterministic: a malformed request or a refused
    // prompt fails identically on the fallback, at double the cost.
    if (attempt.failure.kind === "permanent") break;
  }

  // Re-raises exactly what the provider threw, so an `AbortError` stays an
  // `AbortError` for the code upstream that checks for one.
  if (lastFailure !== null) lastFailure.rethrow();
  throw new AppError("UPSTREAM_ERROR", "The model provider did not respond.");
}

type AttemptOutcome<TResult> =
  | { readonly outcome: "succeeded"; readonly result: TResult; readonly attempts: number }
  | { readonly outcome: "failed"; readonly failure: ProviderFailure; readonly attempts: number };

/** The retry loop for one model. Separate so the fallback loop above reads as routing, not retrying. */
async function runAttempts<TResult>(params: {
  readonly modelId: ModelId;
  readonly provider: ModelProvider;
  readonly call: ProviderCall<TResult>;
  readonly log: Logger;
  readonly retryPolicy: RetryPolicy;
  readonly breakerPolicy: BreakerPolicy;
  readonly now: () => Date;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly random: () => number;
}): Promise<AttemptOutcome<TResult>> {
  let attempts = 0;

  for (let attempt = 1; attempt <= params.retryPolicy.maxAttempts; attempt += 1) {
    attempts = attempt;
    const startedAt = Date.now();

    try {
      const result = await withSpan(
        "llm.attempt",
        {
          "llm.model": params.modelId,
          "llm.provider": params.provider,
          "llm.attempt": attempt,
        },
        () =>
          params.call({ modelId: params.modelId, timeoutMs: params.retryPolicy.attemptTimeoutMs }),
      );
      recordProviderSuccess({ provider: params.provider, log: params.log });
      return { outcome: "succeeded", result, attempts };
    } catch (error) {
      // Narrowed at the edge, which is the only place the raw throw is seen.
      const failure = toProviderFailure(error);
      const kind = failure.kind;

      // A cancelled call says nothing about the provider's health, so it must
      // not move the breaker — otherwise a user who stops five answers in a
      // row takes the provider out for everyone on the instance.
      if (kind === "aborted") {
        return { outcome: "failed", failure, attempts };
      }

      recordProviderFailure({
        provider: params.provider,
        now: params.now(),
        policy: params.breakerPolicy,
        log: params.log,
      });

      const retrying = shouldRetry({ kind, attempt, policy: params.retryPolicy });
      const delayMs = retrying
        ? backoffDelayMs({ attempt, policy: params.retryPolicy, random: params.random })
        : 0;

      params.log.warn(
        "llm.attempt_failed",
        {
          modelId: params.modelId,
          provider: params.provider,
          attempt,
          kind,
          retrying,
          delayMs,
          latencyMs: Date.now() - startedAt,
        },
        error,
      );

      if (!retrying) return { outcome: "failed", failure, attempts };
      await params.sleep(delayMs);
    }
  }

  return {
    outcome: "failed",
    failure: toProviderFailure(
      new AppError("UPSTREAM_ERROR", "The model provider did not respond."),
    ),
    attempts,
  };
}
