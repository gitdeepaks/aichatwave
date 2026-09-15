import assert from "node:assert/strict";
import test from "node:test";
import {
  messageSearchQuerySchema,
  messageSearchResponseSchema,
  threadListQuerySchema,
} from "@/lib/api/contracts";

test("thread listing defaults to active and accepts explicit archive and pinned filters", () => {
  assert.deepEqual(threadListQuerySchema.parse({}), { view: "active" });
  assert.deepEqual(threadListQuerySchema.parse({ view: "archived", pinned: "true" }), {
    view: "archived",
    pinned: true,
  });
  assert.deepEqual(threadListQuerySchema.parse({ pinned: "false" }), {
    view: "active",
    pinned: false,
  });
});

test("message search trims and bounds its query", () => {
  assert.equal(messageSearchQuerySchema.parse({ q: "  deployment notes  " }).q, "deployment notes");
  assert.equal(messageSearchQuerySchema.safeParse({ q: "" }).success, false);
  assert.equal(messageSearchQuerySchema.safeParse({ q: "x".repeat(201) }).success, false);
});

test("message search has a dedicated result envelope", () => {
  assert.deepEqual(messageSearchResponseSchema.parse({ results: [], nextCursor: null }), {
    results: [],
    nextCursor: null,
  });
  assert.equal(
    messageSearchResponseSchema.safeParse({ messages: [], nextCursor: null }).success,
    false,
  );
});
