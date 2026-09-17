import assert from "node:assert/strict";
import test from "node:test";
import {
  backoffDelayMs,
  breakerAdmits,
  CLOSED_BREAKER,
  DEFAULT_BREAKER_POLICY,
  DEFAULT_RETRY_POLICY,
  isBreakerTripped,
  isRetryable,
  onBreakerFailure,
  onBreakerSuccess,
  shouldRetry,
  type BreakerState,
} from "@/lib/ai/resilience-policy";

test("only transient failures are retried", () => {
  assert.equal(isRetryable("timeout"), true);
  assert.equal(isRetryable("rate_limited"), true);
  assert.equal(isRetryable("upstream_unavailable"), true);
  assert.equal(isRetryable("aborted"), false);
  assert.equal(isRetryable("permanent"), false);
});

test("retries stop at the attempt budget", () => {
  const policy = DEFAULT_RETRY_POLICY;
  assert.equal(shouldRetry({ kind: "timeout", attempt: 1, policy }), true);
  assert.equal(shouldRetry({ kind: "timeout", attempt: 2, policy }), true);
  assert.equal(shouldRetry({ kind: "timeout", attempt: 3, policy }), false);
});

test("a cancelled call is never retried, even on the first attempt", () => {
  assert.equal(shouldRetry({ kind: "aborted", attempt: 1, policy: DEFAULT_RETRY_POLICY }), false);
});

test("backoff grows exponentially and is capped", () => {
  const policy = DEFAULT_RETRY_POLICY;
  const atMax = (attempt: number) => backoffDelayMs({ attempt, policy, random: () => 1 });

  assert.equal(atMax(1), policy.baseDelayMs);
  assert.equal(atMax(2), policy.baseDelayMs * 2);
  assert.equal(atMax(3), policy.baseDelayMs * 4);
  assert.equal(atMax(20), policy.maxDelayMs);
});

test("backoff is full jitter: any draw between zero and the cap", () => {
  const policy = DEFAULT_RETRY_POLICY;
  assert.equal(backoffDelayMs({ attempt: 3, policy, random: () => 0 }), 0);
  assert.equal(backoffDelayMs({ attempt: 3, policy, random: () => 0.5 }), policy.baseDelayMs * 2);
  // An out-of-range generator cannot produce a negative or unbounded delay.
  assert.equal(backoffDelayMs({ attempt: 3, policy, random: () => -5 }), 0);
  assert.equal(backoffDelayMs({ attempt: 3, policy, random: () => 99 }), policy.baseDelayMs * 4);
});

test("the breaker opens on consecutive failures and not before", () => {
  const policy = DEFAULT_BREAKER_POLICY;
  let state: BreakerState = CLOSED_BREAKER;

  for (let failure = 1; failure < policy.failureThreshold; failure += 1) {
    state = onBreakerFailure({ state, nowMs: failure, policy });
    assert.equal(state.status, "closed", `still closed after ${String(failure)} failures`);
  }

  state = onBreakerFailure({ state, nowMs: 1_000, policy });
  assert.equal(state.status, "open");
  assert.equal(isBreakerTripped(state), true);
});

test("one success resets the failure count", () => {
  const policy = DEFAULT_BREAKER_POLICY;
  let state: BreakerState = CLOSED_BREAKER;
  state = onBreakerFailure({ state, nowMs: 1, policy });
  state = onBreakerFailure({ state, nowMs: 2, policy });
  state = onBreakerSuccess();

  assert.deepEqual(state, CLOSED_BREAKER);
});

test("an open breaker refuses calls until the cooldown elapses, then admits one probe", () => {
  const policy = DEFAULT_BREAKER_POLICY;
  const open: BreakerState = { status: "open", openedAtMs: 1_000 };

  const during = breakerAdmits({ state: open, nowMs: 1_000 + policy.openDurationMs - 1, policy });
  assert.equal(during.admitted, false);
  assert.equal(during.next.status, "open");

  const after = breakerAdmits({ state: open, nowMs: 1_000 + policy.openDurationMs, policy });
  assert.equal(after.admitted, true);
  assert.equal(after.next.status, "half_open");

  // Only one probe: a second caller arriving behind it is refused.
  const second = breakerAdmits({ state: after.next, nowMs: 2_000_000, policy });
  assert.equal(second.admitted, false);
});

test("a failed probe re-opens the breaker with the cooldown restarted", () => {
  const policy = DEFAULT_BREAKER_POLICY;
  const reopened = onBreakerFailure({ state: { status: "half_open" }, nowMs: 9_000, policy });

  assert.equal(reopened.status, "open");
  if (reopened.status === "open") assert.equal(reopened.openedAtMs, 9_000);
});

test("a passing probe closes the breaker", () => {
  assert.deepEqual(onBreakerSuccess(), CLOSED_BREAKER);
});
