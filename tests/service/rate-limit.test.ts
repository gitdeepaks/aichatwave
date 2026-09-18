/**
 * The three Phase D limits, against the real counters.
 *
 * `tests/sliding-window.test.ts` already covers the arithmetic as a pure
 * function. What was never covered is the part that only exists in the
 * database: that the window is shared across processes because the row is,
 * that a stream slot is claimed by an insert that either wins or conflicts, and
 * that releasing someone else's lease does nothing.
 */

import assert from "node:assert/strict";
import { dbTest, setupTestDatabase, withTestClient } from "../helpers/database";
import { seedAccountDeletion, seedUser } from "../helpers/seed";
import { isAppError } from "@/server/lib/app-error";
import {
  IP_REQUESTS_PER_MINUTE,
  PLAN_LIMITS,
  STREAM_LEASE_TTL_MS,
} from "@/lib/billing/plan-policy";

setupTestDatabase();

const rateLimit = () => import("@/server/security/rate-limit");

function isRateLimited(error: unknown): boolean {
  return isAppError(error) && error.code === "RATE_LIMITED" && (error.retryAfterSeconds ?? 0) > 0;
}

dbTest("the per-user window admits exactly the plan's allowance", async () => {
  const user = await seedUser({});
  const { assertWithinRateLimit } = await rateLimit();
  const now = new Date();

  for (let request = 0; request < PLAN_LIMITS.free.requestsPerMinute; request += 1) {
    await assertWithinRateLimit({ userId: user.id, planId: "free", clientIp: null, now });
  }

  await assert.rejects(
    () => assertWithinRateLimit({ userId: user.id, planId: "free", clientIp: null, now }),
    isRateLimited,
  );
});

dbTest("a Pro plan gets the Pro window from the same code path", async () => {
  const user = await seedUser({});
  const { assertWithinRateLimit } = await rateLimit();
  const now = new Date();

  // More than the free allowance, comfortably under the Pro one.
  for (let request = 0; request < PLAN_LIMITS.free.requestsPerMinute + 5; request += 1) {
    await assertWithinRateLimit({ userId: user.id, planId: "pro", clientIp: null, now });
  }
});

dbTest("the per-IP ceiling catches many accounts behind one machine", async () => {
  const { assertWithinRateLimit } = await rateLimit();
  const now = new Date();
  const clientIp = "203.0.113.7";

  // A fresh user each time, so the per-user window never rejects and the only
  // limit left is the shared one.
  for (let request = 0; request < IP_REQUESTS_PER_MINUTE; request += 1) {
    const user = await seedUser({});
    await assertWithinRateLimit({ userId: user.id, planId: "free", clientIp, now });
  }

  const nextUser = await seedUser({});
  await assert.rejects(
    () => assertWithinRateLimit({ userId: nextUser.id, planId: "free", clientIp, now }),
    isRateLimited,
  );
});

dbTest("a request with no forwarded IP skips the shared ceiling entirely", async () => {
  const { assertWithinRateLimit, ipBucketKey } = await rateLimit();
  const user = await seedUser({});

  await assertWithinRateLimit({
    userId: user.id,
    planId: "free",
    clientIp: null,
    now: new Date(),
  });

  const buckets = await withTestClient((client) =>
    client.query("select 1 from rate_limit_bucket where bucket_key like $1", [
      `${ipBucketKey("")}%`,
    ]),
  );
  assert.equal(buckets.rowCount, 0);
});

dbTest("concurrent streams are capped at the plan's slots and freed on release", async () => {
  const user = await seedUser({});
  const { acquireChatStreamSlot, releaseChatStreamSlot } = await rateLimit();
  const now = new Date();

  const first = await acquireChatStreamSlot({ userId: user.id, planId: "free", now });
  assert.equal(first.slot, 0);

  // The free plan has exactly one slot, and it is held.
  await assert.rejects(
    () => acquireChatStreamSlot({ userId: user.id, planId: "free", now }),
    isRateLimited,
  );

  await releaseChatStreamSlot(first);

  const second = await acquireChatStreamSlot({ userId: user.id, planId: "free", now });
  assert.equal(second.slot, 0);
  await releaseChatStreamSlot(second);
});

dbTest("a Pro account holds three streams at once and no more", async () => {
  const user = await seedUser({});
  const { acquireChatStreamSlot, releaseChatStreamSlot } = await rateLimit();
  const now = new Date();

  const leases = [];
  for (let stream = 0; stream < PLAN_LIMITS.pro.concurrentStreams; stream += 1) {
    leases.push(await acquireChatStreamSlot({ userId: user.id, planId: "pro", now }));
  }

  assert.deepEqual(leases.map((lease) => lease.slot).sort(), [0, 1, 2]);

  await assert.rejects(
    () => acquireChatStreamSlot({ userId: user.id, planId: "pro", now }),
    isRateLimited,
  );

  for (const lease of leases) await releaseChatStreamSlot(lease);
});

dbTest("an expired lease is taken over rather than locking an account out", async () => {
  const user = await seedUser({});
  const { acquireChatStreamSlot, releaseChatStreamSlot, userBucketKey } = await rateLimit();

  // A process that died mid-stream: the lease was never released and its TTL
  // has passed. On the free plan this is the account's only slot, so without
  // takeover the account cannot send anything until the row ages out.
  //
  // Written directly, because expiry is measured by the *database* clock —
  // every replica has to agree on it — so it cannot be arranged by passing an
  // earlier `now` to the service.
  await withTestClient((client) =>
    client.query(
      `insert into stream_lease (owner_key, slot, lease_id, acquired_at, expires_at)
       values ($1, 0, 'lease-from-a-dead-process', now() - $2 * interval '1 millisecond', now() - interval '1 minute')`,
      [userBucketKey(user.id), STREAM_LEASE_TTL_MS],
    ),
  );

  const recovered = await acquireChatStreamSlot({
    userId: user.id,
    planId: "free",
    now: new Date(),
  });
  assert.equal(recovered.slot, 0);
  assert.notEqual(recovered.leaseId, "lease-from-a-dead-process");

  await releaseChatStreamSlot(recovered);
});

dbTest("releasing a lease that has already been taken over frees nothing", async () => {
  const user = await seedUser({});
  const { acquireChatStreamSlot, releaseChatStreamSlot, userBucketKey } = await rateLimit();
  const ownerKey = userBucketKey(user.id);

  const held = await acquireChatStreamSlot({ userId: user.id, planId: "free", now: new Date() });

  // The previous holder of the same slot, releasing late. Matching on lease id
  // is what stops it freeing the slot out from under the current holder.
  await releaseChatStreamSlot({
    ownerKey,
    slot: held.slot,
    leaseId: "a-stale-lease-id",
    expiresAt: held.expiresAt,
  });

  await assert.rejects(
    () => acquireChatStreamSlot({ userId: user.id, planId: "free", now: new Date() }),
    isRateLimited,
  );

  await releaseChatStreamSlot(held);
});

dbTest("an account being deleted cannot take a stream slot", async () => {
  const user = await seedUser({});
  await seedAccountDeletion(user.id);
  const { acquireChatStreamSlot } = await rateLimit();

  await assert.rejects(
    () => acquireChatStreamSlot({ userId: user.id, planId: "free", now: new Date() }),
    (error: unknown) => isAppError(error) && error.code === "CONFLICT",
  );
});
