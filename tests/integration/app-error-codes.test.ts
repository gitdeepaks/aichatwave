/**
 * Phase I's first exit criterion, as a test rather than as a claim:
 * **every `AppErrorCode` is produced by a real route call.**
 *
 * One case per code, each one a request a real client could make, driven
 * through the exported route handler and asserted on the wire envelope. The
 * final test is the gate: it compares the codes this file actually observed
 * against `APP_ERROR_STATUS` and fails on either side of the difference.
 *
 * That gate is not decoration. It is what found `INVALID_CHAT_REQUEST`, a code
 * that had a status, a place in the union, and a unit test constructing it —
 * and no line of production code that could ever throw it. It is gone now.
 * A code added later without a way to reach it will fail here the same way.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { signInAs, signOut } from "../helpers/environment";
import { dbTest, setupTestDatabase } from "../helpers/database";
import {
  polarAuthFailure,
  polarRequestFailure,
  resetPolarStub,
  setPolarCheckoutUrl,
  setPolarFailure,
} from "../helpers/polar-stub";
import { seedAccountDeletion, seedThread, seedUsage, seedUser } from "../helpers/seed";
import { apiRequest, callRoute, readAppError } from "../helpers/http";
import { APP_ERROR_STATUS, type AppErrorCode } from "@/server/lib/app-error";
import { PLAN_LIMITS, RATE_LIMIT_WINDOW_MS } from "@/lib/billing/plan-policy";

setupTestDatabase();

/** Codes this file has seen come back from a route, in the envelope. */
const observed = new Set<string>();

/**
 * Runs one case and records the code it produced.
 *
 * The expected code is asserted here as well as counted, so a case that starts
 * producing a *different* code fails loudly instead of quietly satisfying the
 * gate for the wrong one.
 */
function producesCode(code: AppErrorCode, arrange: () => Promise<Response>): void {
  dbTest(`${code} is produced by a real route call`, async () => {
    resetPolarStub();
    const response = await arrange();
    const error = await readAppError(response);

    assert.equal(error.code, code);
    assert.equal(response.status, APP_ERROR_STATUS[code]);
    observed.add(error.code);
  });
}

async function signedInUser() {
  const user = await seedUser({ billingSyncedAt: new Date() });
  signInAs(user.id);
  return user;
}

function chatBody(overrides: Record<string, unknown> = {}) {
  return {
    threadId: randomUUID(),
    messageContent: "Hello.",
    selectedModel: "gpt-5-nano",
    ...overrides,
  };
}

async function postChat(body: unknown) {
  const { POST } = await import("@/app/api/chat/route");
  return callRoute(POST, apiRequest("POST", "/api/chat", { body }));
}

async function postCheckout() {
  const { POST } = await import("@/app/api/billing/checkout/route");
  return callRoute(POST, apiRequest("POST", "/api/billing/checkout"));
}

producesCode("UNAUTHORIZED", async () => {
  signOut();
  const { GET } = await import("@/app/api/threads/route");
  return callRoute(GET, apiRequest("GET", "/api/threads"));
});

producesCode("INVALID_JSON", async () => {
  await signedInUser();
  const { POST } = await import("@/app/api/threads/route");
  return callRoute(POST, apiRequest("POST", "/api/threads", { rawBody: "{" }));
});

producesCode("INVALID_REQUEST", async () => {
  await signedInUser();
  const { POST } = await import("@/app/api/threads/route");
  return callRoute(POST, apiRequest("POST", "/api/threads", { body: { id: "nope" } }));
});

producesCode("INVALID_CURSOR", async () => {
  await signedInUser();
  const { GET } = await import("@/app/api/threads/route");
  return callRoute(GET, apiRequest("GET", "/api/threads?cursor=Y29ycnVwdA"));
});

producesCode("FORBIDDEN", async () => {
  const owner = await seedUser({});
  const thread = await seedThread({ userId: owner.id });
  await signedInUser();

  const { GET } = await import("@/app/api/threads/[threadId]/route");
  return callRoute(GET, apiRequest("GET", `/api/threads/${thread.id}`), { threadId: thread.id });
});

producesCode("NOT_FOUND", async () => {
  await signedInUser();
  const threadId = randomUUID();

  const { GET } = await import("@/app/api/threads/[threadId]/route");
  return callRoute(GET, apiRequest("GET", `/api/threads/${threadId}`), { threadId });
});

producesCode("CONFLICT", async () => {
  const user = await signedInUser();
  await seedAccountDeletion(user.id);
  return postChat(chatBody());
});

producesCode("MODEL_ACCESS_DENIED", async () => {
  await signedInUser();
  return postChat(chatBody({ selectedModel: "claude-sonnet-4-20250514" }));
});

producesCode("SERVICE_UNAVAILABLE", async () => {
  await signedInUser();
  // Subscription-tier *and* unconfigured on this deployment: availability is
  // checked before plan access, so this is the operator's 503, not a 403.
  return postChat(chatBody({ selectedModel: "gemini-3.1-pro" }));
});

producesCode("QUOTA_EXCEEDED", async () => {
  const user = await signedInUser();
  await seedUsage({ userId: user.id, messages: PLAN_LIMITS.free.monthlyMessages });
  return postChat(chatBody());
});

producesCode("RATE_LIMITED", async () => {
  const user = await signedInUser();

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

  return postChat(chatBody());
});

producesCode("UPSTREAM_ERROR", async () => {
  await signedInUser();
  setPolarFailure(polarRequestFailure());
  return postCheckout();
});

producesCode("INTERNAL_ERROR", async () => {
  await signedInUser();
  // Polar succeeds and returns something the route's own response contract
  // rejects: an untyped throw, which is the only thing that becomes a 500.
  setPolarCheckoutUrl("not-a-url");
  return postCheckout();
});

/**
 * Not a code of its own — `SERVICE_UNAVAILABLE` is already covered above — but
 * the second way to reach it, and the one that distinguishes a dead credential
 * from a dead provider. Worth its own case for the same reason the split
 * exists.
 */
dbTest("a revoked billing credential also reaches SERVICE_UNAVAILABLE", async () => {
  resetPolarStub();
  await signedInUser();
  setPolarFailure(polarAuthFailure());

  const error = await readAppError(await postCheckout());
  assert.equal(error.code, "SERVICE_UNAVAILABLE");
});

dbTest("every declared AppError code was produced above", async () => {
  const declared = Object.keys(APP_ERROR_STATUS).sort();
  const produced = [...observed].sort();

  const unreachable = declared.filter((code) => !observed.has(code));
  assert.deepEqual(
    unreachable,
    [],
    `These codes are declared but no route call in this file produces them: ${unreachable.join(", ")}. ` +
      "Either add a case, or delete the code — a status nothing can return is not a contract.",
  );

  assert.deepEqual(produced, declared);
});
