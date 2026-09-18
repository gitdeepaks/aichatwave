import assert from "node:assert/strict";
import test from "node:test";
import type { UIMessageChunk } from "ai";
import {
  accumulatedText,
  createTurnAccumulator,
  recordChunk,
  toMessageParts,
} from "@/server/chat/turn-recorder";
import { parseToolResult } from "@/lib/ai/tool-contracts";

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

/* ── The sequence the LangChain adapter actually emits ────────────────────── */

/**
 * Captured from a real turn against `next dev`, by reading the SSE body of
 * `POST /api/chat` in the browser. The whole tool call arrives as exactly two
 * chunks:
 *
 *   {"type":"tool-input-start","toolCallId":"01a0…","toolName":"display_weather","dynamic":true}
 *   {"type":"tool-output-available","toolCallId":"01a0…","output":{"lc":1,…}}
 *
 * No `tool-input-available`, no `tool-input-delta`, and the output is still
 * wrapped in LangChain's `ToolMessage` envelope with its content as JSON text.
 *
 * This is the shape the recorder used to drop on the floor: it had no
 * `tool-input-start` case, so `tool-output-available` found nothing to resolve
 * and returned early. Every tool result in the app was lost at commit — the
 * card rendered live and was gone on reload — and the tests above did not catch
 * it because they feed `tool-input-available`, which this adapter never sends.
 */
const OSLO_WEATHER = {
  location: "Oslo, Norway",
  temperature: 16.1,
  feelsLike: 12.8,
  humidity: 60,
  windSpeed: 12.3,
  isDay: true,
  weatherCode: 1,
  hourly: [{ time: "4 PM", temperature: 16, weatherCode: 1 }],
  daily: [{ day: "Fri", min: 12, max: 17, weatherCode: 1 }],
};

const LANGCHAIN_TOOL_OUTPUT = {
  lc: 1,
  type: "constructor",
  id: ["langchain_core", "messages", "ToolMessage"],
  kwargs: { status: "success", content: JSON.stringify(OSLO_WEATHER) },
};

test("a tool call opened by tool-input-start is persisted with its name and output", () => {
  const parts = toMessageParts(
    fold([
      {
        type: "tool-input-start",
        toolCallId: "01a0b57a",
        toolName: "display_weather",
        dynamic: true,
      },
      { type: "tool-output-available", toolCallId: "01a0b57a", output: LANGCHAIN_TOOL_OUTPUT },
    ]),
  );

  assert.equal(parts.length, 1, "the tool call must survive the fold");

  const [tool] = parts;
  assert.equal(tool?.type, "tool");
  if (tool?.type !== "tool") return;

  assert.equal(tool.toolName, "display_weather");
  assert.equal(tool.toolCallId, "01a0b57a");
  assert.equal(tool.state, "output-available");
  assert.deepEqual(tool.output, LANGCHAIN_TOOL_OUTPUT);
});

test("what the recorder persists is what the renderer can parse", () => {
  // The two halves of the contract meet here. `tests/contracts/tool-transport.test.ts`
  // proves the renderer unwraps this envelope; this proves the recorder hands it
  // one to unwrap. Neither alone would have caught the defect.
  const parts = toMessageParts(
    fold([
      {
        type: "tool-input-start",
        toolCallId: "01a0b57a",
        toolName: "display_weather",
        dynamic: true,
      },
      { type: "tool-output-available", toolCallId: "01a0b57a", output: LANGCHAIN_TOOL_OUTPUT },
    ]),
  );

  const [tool] = parts;
  if (tool?.type !== "tool") throw new Error("expected a tool part");

  const rendered = parseToolResult(tool.toolName, tool.output);
  assert.equal(rendered?.toolName, "display_weather");
  assert.deepEqual(rendered?.result, OSLO_WEATHER);
});

test("streamed input fragments are reassembled into the persisted call", () => {
  const parts = toMessageParts(
    fold([
      { type: "tool-input-start", toolCallId: "call_2", toolName: "display_news" },
      { type: "tool-input-delta", toolCallId: "call_2", inputTextDelta: '{"query":' },
      { type: "tool-input-delta", toolCallId: "call_2", inputTextDelta: '"NVDA"}' },
      { type: "tool-output-available", toolCallId: "call_2", output: { news: [] } },
    ]),
  );

  const [tool] = parts;
  if (tool?.type !== "tool") throw new Error("expected a tool part");
  assert.deepEqual(tool.input, { query: "NVDA" });
});

test("a half-streamed argument list is left null rather than guessed at", () => {
  const parts = toMessageParts(
    fold([
      { type: "tool-input-start", toolCallId: "call_3", toolName: "display_products" },
      { type: "tool-input-delta", toolCallId: "call_3", inputTextDelta: '{"query":"iph' },
    ]),
  );

  const [tool] = parts;
  if (tool?.type !== "tool") throw new Error("expected a tool part");
  assert.equal(tool.input, null);
  // Stopped before it resolved, and recorded as exactly that.
  assert.equal(tool.state, "input-streaming");
});

test("an output for a call that was never opened is skipped, not half-recorded", () => {
  // Output chunks carry no `toolName`, so there is nothing to name the part.
  const parts = toMessageParts(
    fold([{ type: "tool-output-available", toolCallId: "orphan", output: { tempC: 1 } }]),
  );

  assert.deepEqual(parts, []);
});

test("a tool result that only serializes through toJSON is persisted, not dropped", () => {
  // Server-side, `tool-output-available` carries the live LangChain object, not
  // the envelope the browser sees — the SSE encoder serializes it later. Zod's
  // `z.json()` rejects a class instance outright, so the recorder used to store
  // `null` for a call it had just marked `output-available`: a tool part that
  // survived the fold and still rendered nothing.
  class FakeToolMessage {
    constructor(private readonly content: string) {}
    toJSON() {
      return {
        lc: 1,
        type: "constructor",
        id: ["langchain_core", "messages", "ToolMessage"],
        kwargs: { status: "success", content: this.content },
      };
    }
  }

  const parts = toMessageParts(
    fold([
      { type: "tool-input-start", toolCallId: "call_4", toolName: "display_weather" },
      {
        type: "tool-output-available",
        toolCallId: "call_4",
        output: new FakeToolMessage(JSON.stringify(OSLO_WEATHER)),
      },
    ]),
  );

  const [tool] = parts;
  if (tool?.type !== "tool") throw new Error("expected a tool part");

  assert.notEqual(tool.output, null, "the output must survive serialization");
  // And it is still the shape the renderer knows how to unwrap.
  assert.deepEqual(parseToolResult(tool.toolName, tool.output)?.result, OSLO_WEATHER);
});
