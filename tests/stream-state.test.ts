import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_STREAM_STATES,
  chatStreamStateSchema,
  isSettledStreamState,
  STREAM_HEARTBEAT_TIMEOUT_MS,
  STREAM_RETENTION_MS,
} from "@/lib/chat/stream-state";

test("only 'streaming' is unsettled, so every other state closes a replay", () => {
  for (const state of CHAT_STREAM_STATES) {
    assert.equal(isSettledStreamState(state), state !== "streaming", state);
  }
});

test("a stop is its own outcome, not a flavour of failure", () => {
  assert.notEqual(chatStreamStateSchema.parse("aborted"), "failed");
  assert.equal(chatStreamStateSchema.safeParse("cancelled").success, false);
});

test("the heartbeat timeout is longer than a plausible gap between tokens", () => {
  assert.ok(STREAM_HEARTBEAT_TIMEOUT_MS >= 60_000);
  // And shorter than retention, or a stale row would be swept before a reader
  // could ever conclude it was stale.
  assert.ok(STREAM_HEARTBEAT_TIMEOUT_MS < STREAM_RETENTION_MS);
});
