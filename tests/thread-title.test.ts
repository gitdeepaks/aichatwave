import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveThreadTitle,
  FALLBACK_THREAD_TITLE,
  GENERATED_TITLE_MAX_LENGTH,
  isPlaceholderTitle,
  normalizeGeneratedTitle,
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

test("a generated title is stripped of the wrappers small models add", () => {
  assert.equal(normalizeGeneratedTitle('"Deploying to Vercel"'), "Deploying to Vercel");
  assert.equal(normalizeGeneratedTitle("Title: Deploying to Vercel"), "Deploying to Vercel");
  assert.equal(normalizeGeneratedTitle("  Subject — Tokyo trip  "), "Tokyo trip");
  assert.equal(normalizeGeneratedTitle("Planning a trip."), "Planning a trip");
  assert.equal(normalizeGeneratedTitle("मुंबई का मौसम?"), "मुंबई का मौसम");
});

test("a title with nothing left after stripping is rejected rather than blanked", () => {
  assert.equal(normalizeGeneratedTitle(""), null);
  assert.equal(normalizeGeneratedTitle('   "" '), null);
  assert.equal(normalizeGeneratedTitle("Title:"), null);
});

test("an over-long generated title is truncated at its own, longer limit", () => {
  const long = "word ".repeat(40);
  const title = normalizeGeneratedTitle(long);

  assert.ok(title !== null);
  assert.ok(title.length <= GENERATED_TITLE_MAX_LENGTH + 1, `got ${title.length}`);
  assert.ok(title.endsWith("…"));
});

/**
 * The guard that keeps a generated title from overwriting a rename the user
 * made while the first answer was still streaming.
 */
test("only the placeholder and the derived title may be replaced", () => {
  assert.equal(isPlaceholderTitle(FALLBACK_THREAD_TITLE, "anything"), true);
  assert.equal(isPlaceholderTitle(deriveThreadTitle("Plan my trip"), "Plan my trip"), true);
  assert.equal(isPlaceholderTitle("My holiday notes", "Plan my trip"), false);
});
