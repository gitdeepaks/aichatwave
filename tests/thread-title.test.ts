import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveThreadTitle,
  FALLBACK_THREAD_TITLE,
  THREAD_TITLE_MAX_LENGTH,
} from "@/server/chat/thread-title";

test("uses the message as-is when short enough", () => {
  assert.equal(deriveThreadTitle("Plan my Tokyo trip"), "Plan my Tokyo trip");
});

test("trims and collapses whitespace", () => {
  assert.equal(deriveThreadTitle("  Plan   my\n trip  "), "Plan my trip");
});

test("falls back for empty or whitespace-only messages", () => {
  assert.equal(deriveThreadTitle(""), FALLBACK_THREAD_TITLE);
  assert.equal(deriveThreadTitle("   \n\t  "), FALLBACK_THREAD_TITLE);
});

test("truncates long messages with an ellipsis", () => {
  const long = "x".repeat(100);
  const title = deriveThreadTitle(long);
  assert.equal(title, `${"x".repeat(THREAD_TITLE_MAX_LENGTH)}…`);
  assert.ok(title.length <= THREAD_TITLE_MAX_LENGTH + 1);
});
