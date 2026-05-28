import assert from "node:assert/strict";
import test from "node:test";
import type { UIMessage } from "ai";
import { getChatVisibleStatus } from "@/components/chat/utils/chat-status";

test("returns error status before transient chat statuses", () => {
  const status = getChatVisibleStatus({
    status: "streaming",
    error: new Error("boom"),
    messages: [],
  });

  assert.deepEqual(status, {
    kind: "error",
    label: "Message failed. Retry available.",
    retryLabel: "Retry",
  });
});

test("returns tool-running status for unfinished dynamic tools", () => {
  const messages = [
    {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "dynamic-tool",
          toolName: "display_products",
          toolCallId: "tool-1",
          state: "input-available",
          input: { query: "desk" },
        },
      ],
    },
  ] satisfies UIMessage[];

  const status = getChatVisibleStatus({ status: "streaming", error: undefined, messages });

  assert.deepEqual(status, {
    kind: "tool-running",
    label: "Searching products...",
    toolName: "display_products",
  });
});

test("returns submitted, streaming, and idle labels", () => {
  assert.deepEqual(getChatVisibleStatus({ status: "submitted", error: undefined, messages: [] }), {
    kind: "submitted",
    label: "Thinking...",
  });

  assert.deepEqual(getChatVisibleStatus({ status: "streaming", error: undefined, messages: [] }), {
    kind: "streaming",
    label: "Writing response...",
  });

  assert.deepEqual(getChatVisibleStatus({ status: "ready", error: undefined, messages: [] }), {
    kind: "idle",
  });
});
