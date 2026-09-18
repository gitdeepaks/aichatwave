import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_ERROR_STATUS,
  AppError,
  appErrorBody,
  appErrorResponse,
  isAppError,
  toAppError,
  type AppErrorCode,
} from "@/server/lib/app-error";

/**
 * Restated rather than derived, so a change to the table is a deliberate edit
 * here too — this is the wire contract `lib/api/chat-error.ts` and every client
 * is written against.
 */
const EXPECTED_STATUS: { code: AppErrorCode; status: number }[] = [
  { code: "INVALID_JSON", status: 400 },
  { code: "INVALID_REQUEST", status: 400 },
  { code: "INVALID_CURSOR", status: 400 },
  { code: "UNAUTHORIZED", status: 401 },
  { code: "FORBIDDEN", status: 403 },
  { code: "MODEL_ACCESS_DENIED", status: 403 },
  { code: "NOT_FOUND", status: 404 },
  { code: "CONFLICT", status: 409 },
  { code: "RATE_LIMITED", status: 429 },
  { code: "QUOTA_EXCEEDED", status: 429 },
  { code: "INTERNAL_ERROR", status: 500 },
  { code: "UPSTREAM_ERROR", status: 502 },
  { code: "SERVICE_UNAVAILABLE", status: 503 },
];

test("maps every error code to its HTTP status", () => {
  // A hand-written list silently stops covering a code that is added later;
  // this is what stops that.
  assert.deepEqual(
    EXPECTED_STATUS.map((entry) => entry.code).sort(),
    Object.keys(APP_ERROR_STATUS).sort(),
  );

  for (const { code, status } of EXPECTED_STATUS) {
    assert.equal(new AppError(code, "x").status, status, code);
  }
});

test("toAppError passes AppError through and wraps unknown values", () => {
  const original = new AppError("FORBIDDEN", "no access");
  assert.equal(toAppError(original), original);

  const cause = new Error("db exploded");
  const wrapped = toAppError(cause);
  assert.equal(wrapped.code, "INTERNAL_ERROR");
  assert.equal(wrapped.status, 500);
  assert.equal(wrapped.cause, cause);
  // Internal details must never leak into the client-safe message.
  assert.ok(!wrapped.message.includes("db exploded"));
});

test("isAppError narrows correctly", () => {
  assert.equal(isAppError(new AppError("NOT_FOUND", "x")), true);
  assert.equal(isAppError(new Error("x")), false);
  assert.equal(isAppError(null), false);
});

test("appErrorBody includes requestId and only includes issues when present", () => {
  const plain = appErrorBody(new AppError("UNAUTHORIZED", "Sign in."), "req-1");
  assert.deepEqual(plain, {
    error: { code: "UNAUTHORIZED", message: "Sign in.", requestId: "req-1" },
  });

  const withIssues = appErrorBody(
    new AppError("INVALID_REQUEST", "Invalid chat request.", {
      issues: [{ path: "threadId", message: "Required" }],
    }),
    "req-2",
  );
  assert.deepEqual(withIssues.error.issues, [{ path: "threadId", message: "Required" }]);
});

test("appErrorResponse sets status and x-request-id header", async () => {
  const response = appErrorResponse(new AppError("MODEL_ACCESS_DENIED", "Upgrade."), "req-3");
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("x-request-id"), "req-3");

  const body: unknown = await response.json();
  assert.deepEqual(body, {
    error: { code: "MODEL_ACCESS_DENIED", message: "Upgrade.", requestId: "req-3" },
  });
});
