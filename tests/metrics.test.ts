import assert from "node:assert/strict";
import test from "node:test";
import {
  apiOutcomeSnapshot,
  billingIngestSnapshot,
  recordApiOutcome,
  recordBillingIngest,
  resetMetrics,
} from "@/server/observability/metrics";

const BASE = new Date("2026-09-17T12:00:00.000Z");

function minutesAfter(minutes: number): Date {
  return new Date(BASE.getTime() + minutes * 60_000);
}

test("a 5xx counts as a failure and a 4xx does not", () => {
  resetMetrics();

  recordApiOutcome({ route: "GET /api/threads", status: 200, now: BASE });
  recordApiOutcome({ route: "GET /api/threads", status: 401, now: BASE });
  recordApiOutcome({ route: "GET /api/threads", status: 429, now: BASE });
  recordApiOutcome({ route: "POST /api/chat", status: 500, now: BASE });

  const snapshot = apiOutcomeSnapshot({ now: BASE });
  assert.equal(snapshot.total, 4);
  assert.equal(snapshot.failures, 1);
});

test("the window excludes anything older than it", () => {
  resetMetrics();

  recordApiOutcome({ route: "r", status: 500, now: BASE });
  recordApiOutcome({ route: "r", status: 200, now: minutesAfter(10) });

  const recent = apiOutcomeSnapshot({ now: minutesAfter(10), windowMinutes: 5 });
  assert.equal(recent.total, 1);
  assert.equal(recent.failures, 0);

  const whole = apiOutcomeSnapshot({ now: minutesAfter(10), windowMinutes: 60 });
  assert.equal(whole.total, 2);
  assert.equal(whole.failures, 1);
});

test("a bucket coming back around after an hour is reset, not added to", () => {
  resetMetrics();

  recordApiOutcome({ route: "r", status: 500, now: BASE });
  // Exactly one ring revolution later: the same slot, a different minute.
  recordApiOutcome({ route: "r", status: 200, now: minutesAfter(60) });

  const snapshot = apiOutcomeSnapshot({ now: minutesAfter(60) });
  assert.equal(snapshot.total, 1);
  assert.equal(snapshot.failures, 0);
});

test("bucketsObserved reports how much of the window actually held traffic", () => {
  resetMetrics();

  recordApiOutcome({ route: "r", status: 200, now: BASE });
  recordApiOutcome({ route: "r", status: 200, now: minutesAfter(1) });

  assert.equal(apiOutcomeSnapshot({ now: minutesAfter(1) }).bucketsObserved, 2);
});

test("billing ingest is counted on its own series", () => {
  resetMetrics();

  recordApiOutcome({ route: "r", status: 500, now: BASE });
  recordBillingIngest({ failed: true, now: BASE });
  recordBillingIngest({ failed: false, now: BASE });

  const billing = billingIngestSnapshot({ now: BASE });
  assert.equal(billing.total, 2);
  assert.equal(billing.failures, 1);
  assert.equal(apiOutcomeSnapshot({ now: BASE }).total, 1);
});
