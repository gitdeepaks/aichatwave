/**
 * Phase L's budgets, and the numbers behind them.
 *
 * Five of the objectives in `lib/observability/slo.ts` are p95s over samples
 * held in process memory rather than read from a table — a choice
 * `server/observability/latency-samples.ts` documents and this file keeps
 * honest: the window has to exclude stale observations, the ring has to stay
 * bounded, and the cold-start bit has to be claimed exactly once, or the two
 * time-to-first-token budgets measure the same thing twice.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { percentile, SLOS } from "@/lib/observability/slo";
import { claimColdStart, resetColdStart } from "@/server/observability/cold-start";
import {
  latencySamples,
  recordLatencySample,
  resetLatencySamples,
} from "@/server/observability/latency-samples";

const BASE = new Date("2026-09-21T09:00:00.000Z");

function minutesAfter(minutes: number): Date {
  return new Date(BASE.getTime() + minutes * 60_000);
}

test("observations come back for the objective they were recorded against", () => {
  resetLatencySamples();

  recordLatencySample({ id: "chat_thread_switch_warm_p95", valueMs: 40, now: BASE });
  recordLatencySample({ id: "chat_thread_switch_cold_p95", valueMs: 380, now: BASE });

  assert.deepEqual(
    latencySamples({ id: "chat_thread_switch_warm_p95", windowMinutes: 60, now: BASE }),
    [40],
  );
  assert.deepEqual(
    latencySamples({ id: "chat_thread_switch_cold_p95", windowMinutes: 60, now: BASE }),
    [380],
  );
});

test("the window excludes anything older than it", () => {
  resetLatencySamples();

  recordLatencySample({ id: "chat_optimistic_echo_p95", valueMs: 900, now: BASE });
  recordLatencySample({ id: "chat_optimistic_echo_p95", valueMs: 8, now: minutesAfter(30) });

  const recent = latencySamples({
    id: "chat_optimistic_echo_p95",
    windowMinutes: 5,
    now: minutesAfter(30),
  });
  assert.deepEqual(recent, [8]);

  const whole = latencySamples({
    id: "chat_optimistic_echo_p95",
    windowMinutes: 60,
    now: minutesAfter(30),
  });
  assert.equal(whole.length, 2);
});

test("a value that is not a finite duration is dropped rather than recorded", () => {
  resetLatencySamples();

  recordLatencySample({ id: "chat_thread_switch_warm_p95", valueMs: Number.NaN, now: BASE });
  recordLatencySample({ id: "chat_thread_switch_warm_p95", valueMs: -1, now: BASE });
  recordLatencySample({
    id: "chat_thread_switch_warm_p95",
    valueMs: Number.POSITIVE_INFINITY,
    now: BASE,
  });

  assert.deepEqual(
    latencySamples({ id: "chat_thread_switch_warm_p95", windowMinutes: 60, now: BASE }),
    [],
  );
});

test("the ring is bounded: a busy window keeps the newest observations, not all of them", () => {
  resetLatencySamples();

  for (let index = 0; index < 2_500; index += 1) {
    recordLatencySample({ id: "chat_thread_switch_warm_p95", valueMs: index, now: BASE });
  }

  const values = latencySamples({
    id: "chat_thread_switch_warm_p95",
    windowMinutes: 60,
    now: BASE,
  });

  assert.equal(values.length, 2_000);
  // The first 500 were overwritten, so the smallest surviving value is 500.
  assert.equal(Math.min(...values), 500);
});

test("a p95 of observations under budget reports healthy against the real objective", () => {
  resetLatencySamples();

  for (let index = 0; index < 40; index += 1) {
    recordLatencySample({ id: "chat_thread_switch_warm_p95", valueMs: 30, now: BASE });
  }

  const values = latencySamples({
    id: "chat_thread_switch_warm_p95",
    windowMinutes: 60,
    now: BASE,
  });
  const p95 = percentile(values, 0.95);

  assert.notEqual(p95, null);
  assert.ok(
    p95 !== null && p95 <= SLOS.chat_thread_switch_warm_p95.objective,
    "30ms should be inside the 100ms budget",
  );
});

test("exactly one invocation per process is a cold start", () => {
  resetColdStart();

  assert.equal(claimColdStart(), true);
  assert.equal(claimColdStart(), false);
  assert.equal(claimColdStart(), false);
});
