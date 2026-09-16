import assert from "node:assert/strict";
import test from "node:test";
import type { UIMessageChunk } from "ai";
import {
  accumulatedText,
  createTurnAccumulator,
  recordChunk,
  toMessageParts,
} from "@/server/chat/turn-recorder";

function fold(chunks: UIMessageChunk[]) {
  const accumulator = createTurnAccumulator();
  for (const chunk of chunks) recordChunk(accumulator, chunk);
  return accumulator;
}

test("text deltas are concatenated per block, in the order the blocks opened", () => {
  const parts = toMessageParts(
    fold([
      { type: "text-start", id: "a" },
      { type: "text-delta", id: "a", delta: "Hello" },
      { type: "text-delta", id: "a", delta: " world" },
      { type: "text-end", id: "a" },
    ]),
  );

  assert.deepEqual(parts, [{ type: "text", text: "Hello world" }]);
});

test("a tool call resolves in place rather than producing a second part", () => {
  const parts = toMessageParts(
    fold([
      {
        type: "tool-input-available",
        toolCallId: "call_1",
        toolName: "display_weather",
        input: { city: "Mumbai" },
      },
      { type: "tool-output-available", toolCallId: "call_1", output: { tempC: 31 } },
    ]),
  );

  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0], {
    type: "tool",
    toolCallId: "call_1",
    toolName: "display_weather",
    state: "output-available",
    input: { city: "Mumbai" },
    output: { tempC: 31 },
    errorText: null,
  });
});

test("a tool error is recorded as output-error carrying the message", () => {
  const parts = toMessageParts(
    fold([
      {
        type: "tool-input-available",
        toolCallId: "call_1",
        toolName: "display_news",
        input: {},
      },
      { type: "tool-output-error", toolCallId: "call_1", errorText: "upstream 500" },
    ]),
  );

  assert.deepEqual(parts[0], {
    type: "tool",
    toolCallId: "call_1",
    toolName: "display_news",
    state: "output-error",
    input: {},
    output: null,
    errorText: "upstream 500",
  });
});

/**
 * The stop button's contract: what was streamed is what is kept, and a tool
 * the model asked for but nothing answered stays visible as unfinished rather
 * than vanishing from the history.
 */
test("a stopped turn keeps its partial text and its unresolved tool call", () => {
  const parts = toMessageParts(
    fold([
      { type: "text-start", id: "a" },
      { type: "text-delta", id: "a", delta: "Let me check" },
      {
        type: "tool-input-available",
        toolCallId: "call_1",
        toolName: "display_weather",
        input: { city: "Mumbai" },
      },
    ]),
  );

  assert.deepEqual(parts, [
    { type: "text", text: "Let me check" },
    {
      type: "tool",
      toolCallId: "call_1",
      toolName: "display_weather",
      state: "input-available",
      input: { city: "Mumbai" },
      output: null,
      errorText: null,
    },
  ]);
});

test("reasoning is preserved and kept separate from the answer", () => {
  const parts = toMessageParts(
    fold([
      { type: "reasoning-start", id: "r" },
      { type: "reasoning-delta", id: "r", delta: "The user wants weather." },
      { type: "text-start", id: "a" },
      { type: "text-delta", id: "a", delta: "It is 31°C." },
    ]),
  );

  assert.deepEqual(parts, [
    { type: "reasoning", text: "The user wants weather." },
    { type: "text", text: "It is 31°C." },
  ]);
});

test("a block that opened but never received a token is dropped", () => {
  const parts = toMessageParts(
    fold([
      { type: "text-start", id: "a" },
      { type: "reasoning-start", id: "r" },
    ]),
  );

  assert.deepEqual(parts, []);
});

test("a tool result for a call that was never announced is ignored", () => {
  const parts = toMessageParts(
    fold([{ type: "tool-output-available", toolCallId: "ghost", output: { a: 1 } }]),
  );

  assert.deepEqual(parts, []);
});

test("transport-only chunks contribute nothing to the persisted message", () => {
  const parts = toMessageParts(
    fold([
      { type: "start", messageId: "m1" },
      { type: "start-step" },
      { type: "text-start", id: "a" },
      { type: "text-delta", id: "a", delta: "hi" },
      { type: "finish-step" },
      { type: "finish" },
      { type: "message-metadata", messageMetadata: { modelId: "gpt-5-nano" } },
    ]),
  );

  assert.deepEqual(parts, [{ type: "text", text: "hi" }]);
});

test("a tool loop's several text blocks are joined for the title generator", () => {
  const accumulator = fold([
    { type: "text-start", id: "a" },
    { type: "text-delta", id: "a", delta: "Checking." },
    { type: "text-start", id: "b" },
    { type: "text-delta", id: "b", delta: "It is 31°C." },
  ]);

  assert.equal(accumulatedText(accumulator), "Checking.\nIt is 31°C.");
  assert.equal(toMessageParts(accumulator).length, 2);
});
