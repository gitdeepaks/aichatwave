import assert from "node:assert/strict";
import test from "node:test";
import { chatRequestSchema } from "@/app/api/chat/schema";
import { DEFAULT_MODEL_ID } from "@/lib/ai/model-registry";

const request = {
  threadId: "thread_1",
  messageContent: "what is the weather in Mumbai?",
  selectedModel: "gpt-5-mini",
};

test("a valid request parses and keeps the requested model", () => {
  const parsed = chatRequestSchema.parse(request);

  assert.equal(parsed.threadId, "thread_1");
  assert.equal(parsed.messageContent, "what is the weather in Mumbai?");
  assert.equal(parsed.selectedModel, "gpt-5-mini");
});

test("an omitted model falls back to the registry default", () => {
  const { selectedModel: _omitted, ...withoutModel } = request;

  assert.equal(chatRequestSchema.parse(withoutModel).selectedModel, DEFAULT_MODEL_ID);
});

test("an unknown model is a validation error naming the field, not a silent fallback", () => {
  const result = chatRequestSchema.safeParse({ ...request, selectedModel: "gpt-4o" });

  assert.equal(result.success, false);
  assert.deepEqual(result.error?.issues[0]?.path, ["selectedModel"]);
});

test("empty, whitespace-only and oversized messages are rejected", () => {
  assert.equal(chatRequestSchema.safeParse({ ...request, messageContent: "" }).success, false);
  assert.equal(chatRequestSchema.safeParse({ ...request, messageContent: "   " }).success, false);
  assert.equal(
    chatRequestSchema.safeParse({ ...request, messageContent: "x".repeat(20_001) }).success,
    false,
  );
  assert.equal(chatRequestSchema.safeParse({ ...request, threadId: " " }).success, false);
});
