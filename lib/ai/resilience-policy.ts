/**
 * Retry, backoff, and circuit-breaker arithmetic for provider calls, kept pure
 * so it can be tested without a provider, a clock, or a random number.
 *
 * `llmCall` used to log and rethrow. A single 429 from OpenAI therefore cost
 * the user their whole turn — and, because the quota reservation happens
 * before the graph runs, a message off their allowance as well. What follows
 * is the smallest policy that fixes that without turning a real outage into a
 * retry storm:
 *
 *  - a per-attempt timeout, because a provider that never answers is worse
 *    than one that fails;
 *  - a bounded number of attempts, with full-jitter backoff, because
 *    synchronized retries from every instance are how a struggling provider is
 *    kept down;
 *  - a breaker per provider, because once a provider is failing, the useful
 *    thing to do with the next request is send it somewhere else rather than
 *    spend 30 seconds proving the outage again.
 *
 * The module that applies it is `server/ai/llm-invoke.ts`; this one decides
 * what the numbers mean.
 */

/**
 * What kind of failure a provider call produced.
 *
 * A closed union rather than a status code, because the three provider SDKs
 * report the same conditions in three different shapes and every consumer here
 * cares about exactly one question: try again, or not?
 */
export type ProviderFailureKind =
  /** The attempt exceeded its own deadline. */
  | "timeout"
  /** The provider asked us to slow down (429). */
  | "rate_limited"
  /** The provider is broken or unreachable (5xx, connection reset, DNS). */
  | "upstream_unavailable"
  /** The caller stopped the turn, or the turn deadline fired. Never retried. */
  | "aborted"
  /** Bad key, bad request, content refusal. Retrying reproduces it exactly. */
  | "permanent";

export type RetryPolicy = {
  /** Total attempts including the first, so 3 means "one try and two retries". */
  readonly maxAttempts: number;
  /** Ceiling for one attempt, in milliseconds. */
  readonly attemptTimeoutMs: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
};

/**
 * Three attempts, not five: the turn has a user waiting on it and a deadline
 * of its own (`MAX_TURN_DURATION_MS`). Two retries covers the transient blip
 * that motivates retrying at all; beyond that the breaker and the fallback
 * model are the better answer.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  attemptTimeoutMs: 60_000,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
};

/**
 * An abort is the user's decision and a permanent failure is deterministic;
 * retrying either wastes the user's time to reach the same place.
 */
export function isRetryable(kind: ProviderFailureKind): boolean {
  return kind === "timeout" || kind === "rate_limited" || kind === "upstream_unavailable";
}

export function shouldRetry(params: {
  readonly kind: ProviderFailureKind;
  /** 1-based: the attempt that just failed. */
  readonly attempt: number;
  readonly policy: RetryPolicy;
}): boolean {
  if (!isRetryable(params.kind)) return false;
  return params.attempt < params.policy.maxAttempts;
}

/**
 * Full jitter: a uniform draw from `[0, cap]` rather than `cap` itself.
 *
 * Exponential backoff alone still has every caller retrying at the same
 * instant, which is precisely the load a recovering provider cannot take.
 * Randomizing the whole interval — not just a fraction of it — is what spreads
 * them, and it is measurably better than "exponential plus a little noise".
 *
 * `random` is a parameter so the test asserts the bounds rather than reaching
 * for a seeded generator.
 */
export function backoffDelayMs(params: {
  /** 1-based: the attempt that just failed. */
  readonly attempt: number;
  readonly policy: RetryPolicy;
  readonly random: () => number;
}): number {
  const { attempt, policy, random } = params;
  const exponent = Math.max(0, attempt - 1);
  const cap = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** exponent);
  return Math.round(Math.min(1, Math.max(0, random())) * cap);
}

/* ─── Circuit breaker ────────────────────────────────────────────────────── */

export type BreakerPolicy = {
  /** Consecutive failures that trip the breaker open. */
  readonly failureThreshold: number;
  /** How long the breaker stays open before one probe is allowed through. */
  readonly openDurationMs: number;
};

export const DEFAULT_BREAKER_POLICY: BreakerPolicy = {
  failureThreshold: 5,
  openDurationMs: 30_000,
};

/**
 * Three states, made unrepresentable in combination: `openedAtMs` only exists
 * while open, and `consecutiveFailures` only while closed, so there is no
 * "open breaker with a stale failure count" to reason about.
 */
export type BreakerState =
  | { readonly status: "closed"; readonly consecutiveFailures: number }
  | { readonly status: "open"; readonly openedAtMs: number }
  /** One probe is in flight. Its result decides whether the breaker closes or re-opens. */
  | { readonly status: "half_open" };

export const CLOSED_BREAKER: BreakerState = { status: "closed", consecutiveFailures: 0 };

/**
 * Whether a call may proceed, and the state to store before it does.
 *
 * Returns the next state rather than mutating, so the caller writes it once
 * and the transition cannot be half-applied. An open breaker whose cooldown
 * has elapsed moves to `half_open` *and* admits the call: that call is the
 * probe.
 */
export function breakerAdmits(params: {
  readonly state: BreakerState;
  readonly nowMs: number;
  readonly policy: BreakerPolicy;
}): { readonly admitted: boolean; readonly next: BreakerState } {
  const { state, nowMs, policy } = params;

  switch (state.status) {
    case "closed":
      return { admitted: true, next: state };
    case "half_open":
      // A probe is already out. Admitting a second one would let a herd
      // through on the strength of an answer nobody has yet.
      return { admitted: false, next: state };
    case "open": {
      if (nowMs - state.openedAtMs < policy.openDurationMs) {
        return { admitted: false, next: state };
      }
      return { admitted: true, next: { status: "half_open" } };
    }
  }
}

/** Success closes the breaker outright — including from `half_open`, which is the probe passing. */
export function onBreakerSuccess(): BreakerState {
  return CLOSED_BREAKER;
}

export function onBreakerFailure(params: {
  readonly state: BreakerState;
  readonly nowMs: number;
  readonly policy: BreakerPolicy;
}): BreakerState {
  const { state, nowMs, policy } = params;

  switch (state.status) {
    case "open":
      return state;
    case "half_open":
      // The probe failed: back to open, with the cooldown restarted from now.
      return { status: "open", openedAtMs: nowMs };
    case "closed": {
      const consecutiveFailures = state.consecutiveFailures + 1;
      if (consecutiveFailures >= policy.failureThreshold) {
        return { status: "open", openedAtMs: nowMs };
      }
      return { status: "closed", consecutiveFailures };
    }
  }
}

/** True while the provider should be considered down for routing purposes. */
export function isBreakerTripped(state: BreakerState): boolean {
  return state.status !== "closed";
}
