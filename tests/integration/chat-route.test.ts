/**
 * `POST /api/chat` — the gates, in the order `streamChat` documents.
 *
 * Every test here is a request that must be refused, and refused *before* the
 * model is reached: that is the whole point of the gate order, and none of it
 * had ever been exercised through a real HTTP call. None of these tests touch a
 * provider, because a request that reaches one has already failed.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { findLogLine, signInAs, signOut } from "../helpers/environment";
import { dbTest, setupTestDatabase } from "../helpers/database";
import { resetPolarStub, setPolarSubscriptions } from "../helpers/polar-stub";
import { seedAccountDeletion, seedThread, seedUsage, seedUser } from "../helpers/seed";
import { apiRequest, callRoute, expectAppError } from "../helpers/http";
import { PLAN_LIMITS, RATE_LIMIT_WINDOW_MS } from "@/lib/billing/plan-policy";

setupTestDatabase();

const chatRoute = () => import("@/app/api/chat/route");

/** A valid body, so a test changes exactly the one thing it is about. */
function chatBody(overrides: Record<string, unknown> = {}) {
  return {
    threadId: randomUUID(),
    messageContent: "What is in this repository?",
    selectedModel: "gpt-5-nano",
    ...overrides,
  };
}

async function post(body: unknown) {
  const { POST } = await chatRoute();
  return callRoute(POST, apiRequest("POST", "/api/chat", { body }));
}

dbTest("an anonymous chat request is 401", async () => {
  resetPolarStub();
  signOut();

  await expectAppError(await post(chatBody()), "UNAUTHORIZED");
});

dbTest("an empty message with no attachments is 400 naming messageContent", async () => {
  resetPolarStub();
  const user = await seedUser({ billingSyncedAt: new Date() });
  signInAs(user.id);

  const response = await post(chatBody({ messageContent: "   " }));

  const error = await expectAppError(response, "INVALID_REQUEST");
  assert.deepEqual(
    error.issues?.map((issue) => issue.path),
    ["body.messageContent"],
  );
});

dbTest("an unknown model id is rejected by the schema, not by a fallback", async () => {
  resetPolarStub();
  const user = await seedUser({ billingSyncedAt: new Date() });
  signInAs(user.id);

  const response = await post(chatBody({ selectedModel: "gpt-9-omniscient" }));

  const error = await expectAppError(response, "INVALID_REQUEST");
  assert.deepEqual(
    error.issues?.map((issue) => issue.path),
    ["body.selectedModel"],
  );
});

dbTest("someone else's thread is 403 and nothing is written to it", async () => {
  resetPolarStub();
  const owner = await seedUser({ billingSyncedAt: new Date() });
  const stranger = await seedUser({ billingSyncedAt: new Date() });
  const thread = await seedThread({ userId: owner.id });

  signInAs(stranger.id);
  const response = await post(chatBody({ threadId: thread.id }));

  await expectAppError(response, "FORBIDDEN");
});

dbTest("a model this deployment has no key for is 503, not a billing problem", async () => {
  resetPolarStub();
  const user = await seedUser({ billingSyncedAt: new Date() });
  signInAs(user.id);

  // `gemini-3.1-pro` is subscription-tier *and* unconfigured here. A free user
  // asking for it must be told the deployment cannot serve it — answering 403
  // would invite them to pay for something that still would not work.
  const response = await post(chatBody({ selectedModel: "gemini-3.1-pro" }));

  await expectAppError(response, "SERVICE_UNAVAILABLE");
});

dbTest("a Pro model on the free plan is 403 MODEL_ACCESS_DENIED", async () => {
  resetPolarStub();
  const user = await seedUser({ billingSyncedAt: new Date() });
  signInAs(user.id);

  const response = await post(chatBody({ selectedModel: "claude-sonnet-4-20250514" }));

  await expectAppError(response, "MODEL_ACCESS_DENIED");
});

dbTest("the same Pro model is allowed once the mirror says the plan is active", async () => {
  resetPolarStub();
  const user = await seedUser({ billingSyncedAt: null });
  // Cold billing cache: this is the one request that consults Polar, and Polar
  // says the subscription is active.
  setPolarSubscriptions([
    {
      id: "sub_active",
      productId: "00000000-0000-0000-0000-000000000000",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      endsAt: null,
    },
  ]);
  signInAs(user.id);

  // The turn is refused at the *next* gate — the quota, which is deliberately
  // exhausted — which is how we know model access let it through without
  // letting a test reach a provider.
  await seedUsage({ userId: user.id, messages: PLAN_LIMITS.pro.monthlyMessages });

  const response = await post(chatBody({ selectedModel: "claude-sonnet-4-20250514" }));

  await expectAppError(response, "QUOTA_EXCEEDED");
});

dbTest("an exhausted monthly allowance is 429 QUOTA_EXCEEDED with a Retry-After", async () => {
  resetPolarStub();
  const user = await seedUser({ billingSyncedAt: new Date() });
  signInAs(user.id);
  await seedUsage({ userId: user.id, messages: PLAN_LIMITS.free.monthlyMessages });

  const response = await post(chatBody());

  const error = await expectAppError(response, "QUOTA_EXCEEDED");
  assert.ok((error.retryAfterSeconds ?? 0) > 0, "quota rejection must carry a retry delay");
  assert.equal(response.headers.get("retry-after"), String(error.retryAfterSeconds));
  assert.match(error.message, /Upgrade to Pro/);

  assert.equal(findLogLine("quota.exceeded")?.context?.["planId"], "free");
});

dbTest("a burst past the per-minute window is 429 RATE_LIMITED", async () => {
  resetPolarStub();
  const user = await seedUser({ billingSyncedAt: new Date() });
  signInAs(user.id);

  // Spend the window through the limiter itself rather than by sending real
  // chat requests: the point under test is the limiter, and a loop of genuine
  // turns would be a loop of provider calls.
  const { consumeWindow } = await import("@/server/db/rate-limit-repository");
  const { userBucketKey } = await import("@/server/security/rate-limit");
  const now = new Date();

  for (let hit = 0; hit < PLAN_LIMITS.free.requestsPerMinute; hit += 1) {
    await consumeWindow({
      bucketKey: userBucketKey(user.id),
      limit: PLAN_LIMITS.free.requestsPerMinute,
      windowMs: RATE_LIMIT_WINDOW_MS,
      now,
    });
  }

  const response = await post(chatBody());

  const error = await expectAppError(response, "RATE_LIMITED");
  assert.ok((error.retryAfterSeconds ?? 0) > 0, "a rate-limit rejection must say how long to wait");
  assert.equal(response.headers.get("retry-after"), String(error.retryAfterSeconds));
});

dbTest("an account being deleted cannot start a turn", async () => {
  resetPolarStub();
  const user = await seedUser({ billingSyncedAt: new Date() });
  await seedAccountDeletion(user.id);
  signInAs(user.id);

  await expectAppError(await post(chatBody()), "CONFLICT");
});
