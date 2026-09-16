import assert from "node:assert/strict";
import test from "node:test";
import { chatRequestSchema, chatRequestWithContentSchema } from "@/app/api/chat/schema";
import { MAX_ATTACHMENTS_PER_MESSAGE } from "@/lib/ai/attachments";
import { DEFAULT_MODEL_ID } from "@/lib/ai/model-registry";

const request = {
  threadId: "thread_1",
  messageContent: "what is the weather in Mumbai?",
  selectedModel: "gpt-5-mini",
};

test("a valid request parses and keeps the requested model", () => {
  const parsed = chatRequestWithContentSchema.parse(request);

  assert.equal(parsed.threadId, "thread_1");
  assert.equal(parsed.messageContent, "what is the weather in Mumbai?");
  assert.equal(parsed.selectedModel, "gpt-5-mini");
});

test("an omitted model falls back to the registry default", () => {
  const { selectedModel: _omitted, ...withoutModel } = request;

  assert.equal(chatRequestWithContentSchema.parse(withoutModel).selectedModel, DEFAULT_MODEL_ID);
});

test("an unknown model is a validation error naming the field, not a silent fallback", () => {
  const result = chatRequestWithContentSchema.safeParse({ ...request, selectedModel: "gpt-4o" });

  assert.equal(result.success, false);
  assert.deepEqual(result.error?.issues[0]?.path, ["selectedModel"]);
});

test("attachments and regenerate default to absent rather than undefined", () => {
  const parsed = chatRequestWithContentSchema.parse(request);

  assert.deepEqual(parsed.attachmentIds, []);
  assert.equal(parsed.regenerate, false);
});

test("a message with no text and no attachments is rejected, naming the field", () => {
  for (const messageContent of ["", "   "]) {
    const result = chatRequestWithContentSchema.safeParse({ ...request, messageContent });
    assert.equal(result.success, false, `"${messageContent}" should be rejected`);
    assert.deepEqual(result.error?.issues[0]?.path, ["messageContent"]);
  }
});

test("an attachment stands in for the text, so an image alone is a valid turn", () => {
  const result = chatRequestWithContentSchema.safeParse({
    ...request,
    messageContent: "   ",
    attachmentIds: ["attachment_1"],
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.messageContent, "");
});

test("more attachments than a message may carry is rejected", () => {
  const tooMany = Array.from({ length: MAX_ATTACHMENTS_PER_MESSAGE + 1 }, (_, i) => `a_${i}`);

  assert.equal(
    chatRequestWithContentSchema.safeParse({ ...request, attachmentIds: tooMany }).success,
    false,
  );
});

test("an oversized message and a blank thread id are rejected by the base schema", () => {
  assert.equal(
    chatRequestSchema.safeParse({ ...request, messageContent: "x".repeat(20_001) }).success,
    false,
  );
  assert.equal(chatRequestSchema.safeParse({ ...request, threadId: " " }).success, false);
});
