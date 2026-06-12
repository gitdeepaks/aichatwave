import assert from "node:assert/strict";
import test from "node:test";
import { createLlmCallId, resolveRequestId } from "@/server/lib/request-id";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("honors a well-formed inbound x-request-id header", () => {
  const headers = new Headers({ "x-request-id": "client-abc_123.456" });
  assert.equal(resolveRequestId(headers), "client-abc_123.456");
});

test("mints a UUID when the header is missing", () => {
  assert.match(resolveRequestId(new Headers()), UUID_PATTERN);
});

test("rejects malformed or oversized header values", () => {
  const malformed = new Headers({ "x-request-id": "bad value with spaces!" });
  assert.match(resolveRequestId(malformed), UUID_PATTERN);

  const oversized = new Headers({ "x-request-id": "a".repeat(200) });
  assert.match(resolveRequestId(oversized), UUID_PATTERN);
});

test("createLlmCallId returns unique UUIDs", () => {
  const first = createLlmCallId();
  const second = createLlmCallId();
  assert.match(first, UUID_PATTERN);
  assert.notEqual(first, second);
});
