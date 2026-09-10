import assert from "node:assert/strict";
import test from "node:test";
import type { StoredMessage } from "@langchain/core/messages";
import { z } from "zod";
import { convertLangChainToUI } from "@/lib/converters";
import { parseJsonText, type JsonValue } from "@/lib/json";

/**
 * `StoredMessage`'s declared `data` is narrower than what LangChain actually
 * serializes — `tool_calls` and block content are absent from the type and
 * present at runtime — so fixtures are round-tripped through JSON, which is
 * the one place that shape mismatch is acknowledged.
 */
function stored(type: string, data: JsonValue): StoredMessage {
  return storedMessageFixtureSchema.parse(parseJsonText(JSON.stringify({ type, data })));
}

/**
 * Validated as `{ type, data }` and typed as `StoredMessage` — the slot these
 * fixtures fill. `z.custom` rather than `z.object` precisely because the
 * declared type is narrower than what LangChain writes, which is the mismatch
 * these tests exist to cover.
 */
const storedMessageFixtureSchema = z.custom<StoredMessage>(
  (value) => z.object({ type: z.string(), data: z.looseObject({}) }).safeParse(value).success,
);

test("maps message types to UI roles", () => {
  const messages = convertLangChainToUI([
    stored("human", { content: "hi" }),
    stored("ai", { content: "hello" }),
    stored("system", { content: "be brief" }),
  ]);

  assert.deepEqual(
    messages.map((message) => message.role),
    ["user", "assistant", "system"],
  );
});

test("keeps reasoning parts, from content blocks and from additional_kwargs", () => {
  const [fromBlocks, fromKwargs] = convertLangChainToUI([
    stored("ai", {
      content: [
        { type: "reasoning", reasoning: "weighing options" },
        { type: "text", text: "the answer" },
      ],
    }),
    stored("ai", {
      content: "the answer",
      additional_kwargs: { reasoning_content: "weighing options" },
    }),
  ]);

  assert.deepEqual(fromBlocks?.parts, [
    { type: "reasoning", text: "weighing options", state: "done" },
    { type: "text", text: "the answer", state: "done" },
  ]);
  assert.deepEqual(fromKwargs?.parts, [
    { type: "reasoning", text: "weighing options", state: "done" },
    { type: "text", text: "the answer", state: "done" },
  ]);
});

test("a tool call becomes a dynamic-tool part with its input", () => {
  const [message] = convertLangChainToUI([
    stored("ai", {
      id: "m1",
      content: "",
      tool_calls: [{ id: "call-1", name: "display_weather", args: { location: "Mumbai" } }],
    }),
  ]);

  assert.equal(message?.id, "m1");
  assert.deepEqual(message?.parts, [
    {
      type: "dynamic-tool",
      toolCallId: "call-1",
      toolName: "display_weather",
      state: "input-available",
      input: { location: "Mumbai" },
    },
  ]);
});

test("a tool result is merged into the call it answers", () => {
  const messages = convertLangChainToUI([
    stored("ai", {
      content: "",
      tool_calls: [{ id: "call-1", name: "display_weather", args: {} }],
    }),
    stored("tool", { tool_call_id: "call-1", content: '{"location":"Mumbai"}' }),
  ]);

  assert.equal(messages.length, 1);
  const part = messages[0]?.parts[0];
  assert.ok(part && part.type === "dynamic-tool");
  assert.equal(part.state, "output-available");
  assert.equal(part.output, '{"location":"Mumbai"}');
});

test("a failed tool result becomes an error state, not a silent success", () => {
  const messages = convertLangChainToUI([
    stored("ai", { content: "", tool_calls: [{ id: "call-1", name: "display_news", args: {} }] }),
    stored("tool", { tool_call_id: "call-1", content: "rate limited", status: "error" }),
  ]);

  const part = messages[0]?.parts[0];
  assert.ok(part && part.type === "dynamic-tool");
  assert.equal(part.state, "output-error");
  assert.equal(part.errorText, "rate limited");
});

test("a result with no matching call is dropped", () => {
  const messages = convertLangChainToUI([
    stored("ai", { content: "", tool_calls: [{ id: "call-1", name: "display_news", args: {} }] }),
    stored("tool", { tool_call_id: "call-other", content: "{}" }),
  ]);

  const part = messages[0]?.parts[0];
  assert.ok(part && part.type === "dynamic-tool");
  assert.equal(part.state, "input-available");
});

test("messages with nothing to render are skipped, and ids are stable", () => {
  const messages = convertLangChainToUI([
    stored("ai", { content: "   " }),
    stored("human", { content: "hi" }),
  ]);

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.id, "msg-1");
});

test("an unrecognized stored shape is skipped rather than half-read", () => {
  const messages = convertLangChainToUI([
    stored("ai", { content: 42 }),
    stored("human", { content: "hi" }),
  ]);

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.role, "user");
});
