import assert from "node:assert/strict";
import test from "node:test";
import type { MessageDto } from "@/lib/api/contracts";
import { convertMessageDtoToUI, mergeEarlierMessages } from "@/lib/converters";

function messageDto(parts: MessageDto["parts"], id = "message-1"): MessageDto {
  return {
    id,
    threadId: "thread-1",
    role: "assistant",
    parts,
    modelId: null,
    inputTokens: 0,
    outputTokens: 0,
    createdAt: "2026-09-15T12:00:00.000Z",
  };
}

test("converts message DTO text, reasoning, and every tool state", () => {
  const message = convertMessageDtoToUI(
    messageDto([
      { type: "reasoning", text: "checking" },
      { type: "text", text: "answer" },
      {
        type: "tool",
        toolCallId: "call-streaming",
        toolName: "search",
        state: "input-streaming",
        input: { query: "weather" },
        output: null,
        errorText: null,
      },
      {
        type: "tool",
        toolCallId: "call-ready",
        toolName: "search",
        state: "input-available",
        input: { query: "weather" },
        output: null,
        errorText: null,
      },
      {
        type: "tool",
        toolCallId: "call-1",
        toolName: "weather",
        state: "output-available",
        input: { city: "Mumbai" },
        output: { temperature: 28 },
        errorText: null,
      },
      {
        type: "tool",
        toolCallId: "call-2",
        toolName: "news",
        state: "output-error",
        input: null,
        output: null,
        errorText: "rate limited",
      },
    ]),
  );

  assert.deepEqual(message.parts, [
    { type: "reasoning", text: "checking", state: "done" },
    { type: "text", text: "answer", state: "done" },
    {
      type: "dynamic-tool",
      toolCallId: "call-streaming",
      toolName: "search",
      state: "input-streaming",
      input: { query: "weather" },
    },
    {
      type: "dynamic-tool",
      toolCallId: "call-ready",
      toolName: "search",
      state: "input-available",
      input: { query: "weather" },
    },
    {
      type: "dynamic-tool",
      toolCallId: "call-1",
      toolName: "weather",
      state: "output-available",
      input: { city: "Mumbai" },
      output: { temperature: 28 },
    },
    {
      type: "dynamic-tool",
      toolCallId: "call-2",
      toolName: "news",
      state: "output-error",
      input: null,
      errorText: "rate limited",
    },
  ]);
});

test("prepends earlier messages chronologically and deduplicates ids", () => {
  const current = [convertMessageDtoToUI(messageDto([{ type: "text", text: "new" }], "m2"))];
  const earlier = [
    convertMessageDtoToUI(messageDto([{ type: "text", text: "old" }], "m1")),
    convertMessageDtoToUI(messageDto([{ type: "text", text: "duplicate" }], "m2")),
    convertMessageDtoToUI(messageDto([{ type: "text", text: "duplicate old" }], "m1")),
  ];

  const merged = mergeEarlierMessages(current, earlier);

  assert.deepEqual(
    merged.map((message) => message.id),
    ["m1", "m2"],
  );
  assert.equal(merged[1], current[0]);
});

test("a file part becomes a UI file pointing at this app, not at the store", () => {
  const message = convertMessageDtoToUI(
    messageDto([
      {
        type: "file",
        attachmentId: "att-1",
        filename: "invoice.pdf",
        mediaType: "application/pdf",
        sizeBytes: 2048,
      },
    ]),
  );

  assert.deepEqual(message.parts[0], {
    type: "file",
    mediaType: "application/pdf",
    filename: "invoice.pdf",
    url: "/api/attachments/att-1",
  });
});

/**
 * Attribution has to survive a reload: the live stream reports the model and
 * its token counts as a `message-metadata` chunk, and history has to rebuild
 * the same shape from the columns, or an answer changes appearance on refresh.
 */
test("the persisted columns are rebuilt as message metadata", () => {
  const message = convertMessageDtoToUI({
    ...messageDto([{ type: "text", text: "answer" }]),
    modelId: "gpt-5-mini",
    inputTokens: 1200,
    outputTokens: 340,
  });

  assert.deepEqual(message.metadata, {
    modelId: "gpt-5-mini",
    inputTokens: 1200,
    outputTokens: 340,
    createdAt: "2026-09-15T12:00:00.000Z",
  });
});

test("a user message carries no model, and attribution reads as absent", () => {
  const message = convertMessageDtoToUI(messageDto([{ type: "text", text: "hi" }]));

  assert.equal(message.metadata?.modelId, null);
});
