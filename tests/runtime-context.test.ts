import assert from "node:assert/strict";
import test from "node:test";
import { chatRuntimeContextSchema, toChatRuntimeContext } from "@/server/chat/runtime-context";

const turn = {
  userId: "user_123",
  threadId: "thread_456",
  requestId: "req_789",
  selectedModel: "gpt-5-nano",
};

test("a complete turn parses, and the ids survive unchanged", () => {
  const context = toChatRuntimeContext(turn);

  assert.equal(context.userId, "user_123");
  assert.equal(context.threadId, "thread_456");
  assert.equal(context.requestId, "req_789");
  assert.equal(context.selectedModel, "gpt-5-nano");
});

test("extra fields are dropped, so the context carries only the turn", () => {
  const withMessage = { ...turn, messageContent: "hello" };
  const context = toChatRuntimeContext(withMessage);

  assert.deepEqual(Object.keys(context).sort(), [
    "requestId",
    "selectedModel",
    "threadId",
    "userId",
  ]);
});

test("a missing field is a rejection, not a context with a hole in it", () => {
  for (const field of ["userId", "threadId", "requestId", "selectedModel"] as const) {
    const { [field]: _dropped, ...rest } = turn;
    assert.equal(chatRuntimeContextSchema.safeParse(rest).success, false, `missing ${field}`);
  }

  assert.throws(() => toChatRuntimeContext({ ...turn, userId: "" }));
});

test("an empty id is rejected", () => {
  assert.equal(chatRuntimeContextSchema.safeParse({ ...turn, userId: "" }).success, false);
  assert.equal(chatRuntimeContextSchema.safeParse({ ...turn, threadId: "" }).success, false);
  assert.equal(chatRuntimeContextSchema.safeParse({ ...turn, requestId: "" }).success, false);
});

test("an unknown model id is rejected rather than defaulted", () => {
  assert.equal(
    chatRuntimeContextSchema.safeParse({ ...turn, selectedModel: "gpt-4o" }).success,
    false,
  );
});
