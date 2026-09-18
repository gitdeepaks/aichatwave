/**
 * Plan resolution and the monthly quota, against a real database and a stubbed
 * Polar.
 *
 * The headline property is the one the local mirror exists for: **a warm plan
 * read costs zero Polar calls.** Before the mirror, `assertModelAccess` called
 * `subscriptions.list` on every single message, so vendor latency sat in front
 * of the model and a slow Polar denied a paying user their own plan. The stub
 * counts calls, which is what makes "zero" an assertion rather than a comment.
 *
 * The quota's headline property is that it *reserves* before the model runs.
 * Counting after leaves the last turn free, and under concurrency leaves as
 * many free turns as there are requests in flight.
 */

import assert from "node:assert/strict";
import { dbTest, setupTestDatabase, withTestClient } from "../helpers/database";
import {
  activeSubscription,
  polarCalls,
  resetPolarStub,
  setPolarFailure,
  setPolarSubscriptions,
} from "../helpers/polar-stub";
import { seedSubscription, seedUsage, seedUser } from "../helpers/seed";
import { isAppError } from "@/server/lib/app-error";
import { PLAN_LIMITS } from "@/lib/billing/plan-policy";

setupTestDatabase();

const subscriptionService = () => import("@/server/billing/subscription-service");
const quotaService = () => import("@/server/billing/quota-service");

dbTest("a cold mirror consults Polar once and is warm afterwards", async () => {
  resetPolarStub();
  setPolarSubscriptions([activeSubscription()]);

  // `billingSyncedAt: null` is the cold cache: "no local subscription row"
  // cannot be told apart from "the webhook has not arrived yet".
  const user = await seedUser({ billingSyncedAt: null });
  const { resolvePlan } = await subscriptionService();

  const cold = await resolvePlan(user.id);
  assert.equal(cold.resolution.planId, "pro");
  assert.equal(cold.resolution.source, "polar");
  assert.deepEqual(polarCalls, ["subscriptions.list"]);

  // The reconcile persisted the subscription and stamped the sync, so the next
  // read is local.
  polarCalls.length = 0;
  const warm = await resolvePlan(user.id);
  assert.equal(warm.resolution.planId, "pro");
  assert.equal(warm.resolution.source, "local");
  assert.equal(warm.refresh, null);
  assert.deepEqual(polarCalls, [], "a warm plan read must not call Polar");
});

dbTest("a stale mirror answers locally and hands back a refresh", async () => {
  resetPolarStub();
  setPolarSubscriptions([activeSubscription()]);

  // Synced two days ago: past the 24h backstop for webhooks that never came.
  const syncedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const user = await seedUser({ billingSyncedAt: syncedAt });
  await seedSubscription({ userId: user.id });

  const { resolvePlan } = await subscriptionService();
  const { resolution, refresh } = await resolvePlan(user.id);

  // Answered from the mirror, immediately, with no Polar call on the path.
  assert.equal(resolution.source, "local");
  assert.equal(resolution.planId, "pro");
  assert.equal(resolution.refreshing, true);
  assert.deepEqual(polarCalls, []);

  assert.notEqual(refresh, null);
  await refresh?.();
  assert.deepEqual(polarCalls, ["subscriptions.list"]);
});

dbTest("a failed cold read stays cold rather than caching 'free'", async () => {
  resetPolarStub();
  setPolarFailure(new Error("Polar is down"));
  const user = await seedUser({ billingSyncedAt: null });

  const { resolvePlan } = await subscriptionService();
  const first = await resolvePlan(user.id);

  // Conservative answer, but the sync stamp is only written on success — so the
  // next request retries instead of serving a wrong plan for a day.
  assert.equal(first.resolution.planId, "free");

  const stamp = await withTestClient((client) =>
    client.query<{ billing_synced_at: Date | null }>(
      'select billing_synced_at from "user" where id = $1',
      [user.id],
    ),
  );
  assert.equal(stamp.rows[0]?.billing_synced_at, null);

  polarCalls.length = 0;
  await resolvePlan(user.id);
  assert.deepEqual(polarCalls, ["subscriptions.list"], "a failed cold read must be retried");
});

dbTest("an expired subscription in the mirror is not an active plan", async () => {
  resetPolarStub();
  const user = await seedUser({ billingSyncedAt: new Date() });
  await seedSubscription({
    userId: user.id,
    status: "active",
    currentPeriodEnd: new Date(Date.now() - 60_000),
  });

  const { resolvePlan } = await subscriptionService();
  const { resolution } = await resolvePlan(user.id);

  assert.equal(resolution.planId, "free");
});

dbTest("a Polar status the SDK has never heard of is skipped, not coerced to active", async () => {
  resetPolarStub();
  setPolarSubscriptions([activeSubscription({ status: "quantum_superposition" })]);
  const user = await seedUser({ billingSyncedAt: null });

  const { resolvePlan } = await subscriptionService();
  const { resolution } = await resolvePlan(user.id);

  assert.equal(resolution.planId, "free");

  const rows = await withTestClient((client) =>
    client.query("select 1 from subscription where user_id = $1", [user.id]),
  );
  assert.equal(rows.rowCount, 0, "an unrecognized status must not reach the column");
});

dbTest("assertModelAccess is a pure plan check", async () => {
  const { assertModelAccess } = await subscriptionService();

  assertModelAccess("free", "gpt-5-nano");
  assertModelAccess("pro", "claude-sonnet-4-20250514");

  assert.throws(
    () => {
      assertModelAccess("free", "claude-sonnet-4-20250514");
    },
    (error: unknown) => isAppError(error) && error.code === "MODEL_ACCESS_DENIED",
  );
});

dbTest("the quota reserves before the turn and gives the reservation back", async () => {
  const user = await seedUser({});
  const { assertWithinQuota, refundQuota } = await quotaService();

  const reservation = await assertWithinQuota({ userId: user.id, planId: "free" });
  assert.equal(reservation.snapshot.used, 1);
  assert.equal(reservation.snapshot.remaining, PLAN_LIMITS.free.monthlyMessages - 1);

  // Spent at the moment it is committed to, not after the model answers.
  assert.equal(await messagesUsed(user.id), 1);

  await refundQuota(reservation);
  assert.equal(await messagesUsed(user.id), 0);
});

dbTest("the last allowed message passes and the next is a typed 429", async () => {
  const user = await seedUser({});
  const limit = PLAN_LIMITS.free.monthlyMessages;
  await seedUsage({ userId: user.id, messages: limit - 1 });

  const { assertWithinQuota } = await quotaService();

  const last = await assertWithinQuota({ userId: user.id, planId: "free" });
  assert.equal(last.snapshot.remaining, 0);

  await assert.rejects(
    () => assertWithinQuota({ userId: user.id, planId: "free" }),
    (error: unknown) =>
      isAppError(error) &&
      error.code === "QUOTA_EXCEEDED" &&
      (error.retryAfterSeconds ?? 0) > 0 &&
      // The allowance is not spent by the rejection.
      error.status === 429,
  );

  assert.equal(await messagesUsed(user.id), limit);
});

dbTest("the allowance is per calendar month, so a new period starts empty", async () => {
  const user = await seedUser({});
  const limit = PLAN_LIMITS.free.monthlyMessages;

  const january = new Date(Date.UTC(2026, 0, 15));
  const february = new Date(Date.UTC(2026, 1, 1));

  await seedUsage({ userId: user.id, messages: limit, now: january });

  const { assertWithinQuota, getQuotaSnapshot } = await quotaService();

  await assert.rejects(
    () => assertWithinQuota({ userId: user.id, planId: "free", now: january }),
    (error: unknown) => isAppError(error) && error.code === "QUOTA_EXCEEDED",
  );

  const fresh = await assertWithinQuota({ userId: user.id, planId: "free", now: february });
  assert.equal(fresh.snapshot.used, 1);

  const snapshot = await getQuotaSnapshot({ userId: user.id, planId: "free", now: february });
  assert.equal(snapshot.used, 1);
  assert.equal(snapshot.limit, limit);
});

dbTest("a Pro plan gets the Pro allowance from the same counter", async () => {
  const user = await seedUser({});
  await seedUsage({ userId: user.id, messages: PLAN_LIMITS.free.monthlyMessages });

  const { assertWithinQuota } = await quotaService();
  const reservation = await assertWithinQuota({ userId: user.id, planId: "pro" });

  assert.equal(reservation.snapshot.limit, PLAN_LIMITS.pro.monthlyMessages);
  assert.equal(reservation.snapshot.used, PLAN_LIMITS.free.monthlyMessages + 1);
});

async function messagesUsed(userId: string): Promise<number> {
  const rows = await withTestClient((client) =>
    client.query<{ messages: number }>("select messages from usage_counter where user_id = $1", [
      userId,
    ]),
  );
  return rows.rows[0]?.messages ?? 0;
}
