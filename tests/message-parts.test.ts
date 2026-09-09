import assert from "node:assert/strict";
import test from "node:test";
import {
  hasRenderableContent,
  messagePartsSchema,
  messagePartsToPlainText,
  type MessageParts,
} from "@/lib/ai/message-parts";

test("accepts the three persisted part kinds", () => {
  const parts: MessageParts = [
    { type: "text", text: "hello" },
    { type: "reasoning", text: "thinking" },
    {
      type: "tool",
      toolCallId: "call-1",
      toolName: "display_weather",
      state: "output-available",
      input: { location: "Mumbai" },
      output: { temperature: 31 },
      errorText: null,
    },
  ];

  assert.deepEqual(messagePartsSchema.parse(parts), parts);
});

test("rejects an unknown part type rather than storing it", () => {
  const result = messagePartsSchema.safeParse([{ type: "video", url: "x" }]);

  assert.equal(result.success, false);
});

test("rejects a tool part missing its call id", () => {
  const result = messagePartsSchema.safeParse([
    {
      type: "tool",
      toolCallId: "",
      toolName: "display_news",
      state: "output-available",
      input: null,
      output: null,
      errorText: null,
    },
  ]);

  assert.equal(result.success, false);
});

test("plain text joins only the text parts", () => {
  const parts: MessageParts = [
    { type: "text", text: "first" },
    { type: "reasoning", text: "ignored" },
    { type: "text", text: "second" },
  ];

  assert.equal(messagePartsToPlainText(parts), "first\nsecond");
});

test("a message of only blank text has nothing worth rendering", () => {
  assert.equal(hasRenderableContent([{ type: "text", text: "   " }]), false);
});

test("a tool call counts as renderable even with no text", () => {
  const parts: MessageParts = [
    {
      type: "tool",
      toolCallId: "call-1",
      toolName: "display_products",
      state: "input-available",
      input: { query: "laptop" },
      output: null,
      errorText: null,
    },
  ];

  assert.equal(hasRenderableContent(parts), true);
});
