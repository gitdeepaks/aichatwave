import assert from "node:assert/strict";
import test from "node:test";
import {
  AppError,
  appErrorBody,
  appErrorResponse,
  isAppError,
  toAppError,
} from "@/server/lib/app-error";

test("maps every error code to its HTTP status", () => {
  assert.equal(new AppError("INVALID_JSON", "x").status, 400);
  assert.equal(new AppError("INVALID_CHAT_REQUEST", "x").status, 400);
  assert.equal(new AppError("UNAUTHORIZED", "x").status, 401);
  assert.equal(new AppError("FORBIDDEN", "x").status, 403);
  assert.equal(new AppError("MODEL_ACCESS_DENIED", "x").status, 403);
  assert.equal(new AppError("NOT_FOUND", "x").status, 404);
  assert.equal(new AppError("RATE_LIMITED", "x").status, 429);
  assert.equal(new AppError("INTERNAL_ERROR", "x").status, 500);
  assert.equal(new AppError("UPSTREAM_ERROR", "x").status, 502);
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
    new AppError("INVALID_CHAT_REQUEST", "Invalid chat request.", {
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
