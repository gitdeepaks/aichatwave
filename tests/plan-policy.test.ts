import assert from "node:assert/strict";
import test from "node:test";
import {
  PLAN_IDS,
  PLAN_LIMITS,
  planFromSubscription,
  planLimits,
  quotaSnapshot,
  secondsUntil,
  usagePeriodFor,
} from "@/lib/billing/plan-policy";

test("every plan declares every limit, and pro is never tighter than free", () => {
  for (const planId of PLAN_IDS) {
    const limits = planLimits(planId);
    assert.ok(limits.monthlyMessages > 0);
    assert.ok(limits.requestsPerMinute > 0);
    assert.ok(limits.concurrentStreams > 0);
  }

  assert.ok(PLAN_LIMITS.pro.monthlyMessages > PLAN_LIMITS.free.monthlyMessages);
  assert.ok(PLAN_LIMITS.pro.requestsPerMinute >= PLAN_LIMITS.free.requestsPerMinute);
  assert.ok(PLAN_LIMITS.pro.concurrentStreams >= PLAN_LIMITS.free.concurrentStreams);
});

test("a subscription is the only thing that makes a plan pro", () => {
  assert.equal(planFromSubscription(true), "pro");
  assert.equal(planFromSubscription(false), "free");
});

test("the usage period is the UTC calendar month, not a local one", () => {
  // 00:30 on the first in UTC+5:30 is still the previous month locally; the
  // period must not move with the server's timezone.
  const period = usagePeriodFor(new Date("2026-09-01T00:30:00.000Z"));

  assert.equal(period.start.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(period.end.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("the usage period rolls the year over at December", () => {
  const period = usagePeriodFor(new Date("2026-12-14T09:00:00.000Z"));

  assert.equal(period.start.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(period.end.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("a snapshot never reports negative remaining, even past the limit", () => {
  const snapshot = quotaSnapshot({
    planId: "free",
    used: PLAN_LIMITS.free.monthlyMessages + 25,
    now: new Date("2026-09-11T00:00:00.000Z"),
  });

  assert.equal(snapshot.remaining, 0);
  assert.equal(snapshot.limit, PLAN_LIMITS.free.monthlyMessages);
  assert.equal(snapshot.resetAt.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("seconds-until is a whole number and never below one", () => {
  const now = new Date("2026-09-11T00:00:00.000Z");

  assert.equal(secondsUntil(new Date("2026-09-11T00:00:10.400Z"), now), 11);
  assert.equal(secondsUntil(new Date("2026-09-10T00:00:00.000Z"), now), 1);
});
