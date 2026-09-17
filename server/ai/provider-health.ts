/**
 * Per-provider circuit breaker state for this process.
 *
 * In memory, not in the database, and that is a deliberate trade. A shared
 * breaker would trip once for the whole fleet instead of once per instance,
 * which sounds better until you price it: every provider call would take a
 * round trip to Postgres to ask permission, on the hot path, to protect
 * against a failure mode that resolves itself in thirty seconds. Per-instance
 * state converges on the same answer within a few requests — each instance
 * learns the provider is down from its own traffic — and costs nothing.
 *
 * What it means in practice: a fleet of four instances may make up to four
 * times `failureThreshold` doomed calls before all of them have stopped
 * trying. That is bounded, small, and much cheaper than the alternative.
 *
 * The state machine itself is pure and lives in `lib/ai/resilience-policy.ts`;
 * this module is only the map and the logging.
 */

import type { ModelProvider } from "@/lib/ai/model-registry";
import {
  breakerAdmits,
  CLOSED_BREAKER,
  DEFAULT_BREAKER_POLICY,
  isBreakerTripped,
  onBreakerFailure,
  onBreakerSuccess,
  type BreakerPolicy,
  type BreakerState,
} from "@/lib/ai/resilience-policy";
import { logger, type Logger } from "@/server/lib/logger";

const breakers = new Map<ModelProvider, BreakerState>();

function stateOf(provider: ModelProvider): BreakerState {
  return breakers.get(provider) ?? CLOSED_BREAKER;
}

/**
 * Whether a call to this provider may proceed right now.
 *
 * Writes the transition back before answering, so an open breaker whose
 * cooldown has just elapsed admits exactly one probe even under concurrency
 * within this process.
 */
export function admitProviderCall(params: {
  readonly provider: ModelProvider;
  readonly now?: Date;
  readonly policy?: BreakerPolicy;
}): boolean {
  const policy = params.policy ?? DEFAULT_BREAKER_POLICY;
  const nowMs = (params.now ?? new Date()).getTime();
  const { admitted, next } = breakerAdmits({ state: stateOf(params.provider), nowMs, policy });
  breakers.set(params.provider, next);
  return admitted;
}

export function recordProviderSuccess(params: {
  readonly provider: ModelProvider;
  readonly log?: Logger;
}): void {
  const previous = stateOf(params.provider);
  breakers.set(params.provider, onBreakerSuccess());

  if (isBreakerTripped(previous)) {
    (params.log ?? logger).info("llm.provider_breaker_closed", { provider: params.provider });
  }
}

export function recordProviderFailure(params: {
  readonly provider: ModelProvider;
  readonly now?: Date;
  readonly policy?: BreakerPolicy;
  readonly log?: Logger;
}): void {
  const policy = params.policy ?? DEFAULT_BREAKER_POLICY;
  const nowMs = (params.now ?? new Date()).getTime();
  const previous = stateOf(params.provider);
  const next = onBreakerFailure({ state: previous, nowMs, policy });
  breakers.set(params.provider, next);

  // Logged on the edge only. A line per failure would bury the one transition
  // an operator actually needs to see.
  if (next.status === "open" && previous.status !== "open") {
    (params.log ?? logger).error("llm.provider_breaker_opened", {
      provider: params.provider,
      openDurationMs: policy.openDurationMs,
      failureThreshold: policy.failureThreshold,
    });
  }
}

/** Providers whose breaker is closed. This is the set `fallbackModelId` routes against. */
export function healthyProviders(providers: readonly ModelProvider[]): ReadonlySet<ModelProvider> {
  return new Set(providers.filter((provider) => !isBreakerTripped(stateOf(provider))));
}

export function providerBreakerStatus(provider: ModelProvider): BreakerState["status"] {
  return stateOf(provider).status;
}

/** Test seam: forget every breaker, so one test's outage cannot leak into the next. */
export function resetProviderHealth(): void {
  breakers.clear();
}
