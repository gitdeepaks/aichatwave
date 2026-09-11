import assert from "node:assert/strict";
import test from "node:test";
import { formatRetryDelay, parseChatError } from "@/lib/api/chat-error";

/** What `DefaultChatTransport` actually throws: the response body as a string. */
function transportError(body: unknown): Error {
  return new Error(JSON.stringify(body));
}

test("no error is not an error", () => {
  assert.equal(parseChatError(null), null);
  assert.equal(parseChatError(undefined), null);
});

test("a 429 from the sliding window becomes a rate-limited error with its wait", () => {
  const parsed = parseChatError(
    transportError({
      error: {
        code: "RATE_LIMITED",
        message: "You're sending messages too quickly.",
        requestId: "req-1",
        retryAfterSeconds: 42,
      },
    }),
  );

  assert.deepEqual(parsed, {
    kind: "rate-limited",
    message: "You're sending messages too quickly.",
    retryAfterSeconds: 42,
    requestId: "req-1",
  });
});

test("quota and rate limiting share a status code but not a remedy", () => {
  const quota = parseChatError(
    transportError({
      error: { code: "QUOTA_EXCEEDED", message: "Out of messages.", requestId: "req-2" },
    }),
  );

  assert.equal(quota?.kind, "quota-exceeded");
  assert.equal(quota?.retryAfterSeconds, null);
});

test("codes that call for the same action collapse to one kind", () => {
  const pairs: Array<[string, string]> = [
    ["UNAUTHORIZED", "unauthorized"],
    ["FORBIDDEN", "unauthorized"],
    ["SERVICE_UNAVAILABLE", "unavailable"],
    ["UPSTREAM_ERROR", "unavailable"],
    ["MODEL_ACCESS_DENIED", "model-access-denied"],
    ["INTERNAL_ERROR", "unknown"],
    ["SOMETHING_NEW", "unknown"],
  ];

  for (const [code, kind] of pairs) {
    const parsed = parseChatError(
      transportError({ error: { code, message: "m", requestId: "r" } }),
    );
    assert.equal(parsed?.kind, kind, `expected ${code} to map to ${kind}`);
  }
});

test("a network failure has no envelope and degrades to unknown", () => {
  const parsed = parseChatError(new Error("Failed to fetch"));

  assert.deepEqual(parsed, {
    kind: "unknown",
    message: "Failed to fetch",
    retryAfterSeconds: null,
    requestId: null,
  });
});

test("an empty message still produces something showable", () => {
  assert.equal(parseChatError(new Error(""))?.message, "Something went wrong.");
});

test("a wait is formatted at the coarsest unit that still reads precisely", () => {
  assert.equal(formatRetryDelay(1), "1s");
  assert.equal(formatRetryDelay(59), "59s");
  assert.equal(formatRetryDelay(60), "1m");
  assert.equal(formatRetryDelay(61), "2m");
  assert.equal(formatRetryDelay(3600), "1h");
  assert.equal(formatRetryDelay(86_400), "1d");
});
