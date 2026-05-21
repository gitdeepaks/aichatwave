import { db } from "@/db";
import { thread } from "@/db/schema/chat-schema";
import { mapChatMessagesToStoredMessages, type BaseMessage } from "@langchain/core/messages";
import { and, eq } from "drizzle-orm";

export const getConversationHistory = async ({
  graph,
  threadId,
  userId,
}: {
  graph: {
    getState: (config: { configurable: { thread_id: string } }) => Promise<unknown>;
  };
  threadId: string;
  userId: string;
}) => {
  //todo: check the ownership

  const existingThreads = await db
    .select()
    .from(thread)
    .where(and(eq(thread.id, threadId), eq(thread.userId, userId)))
    .limit(1);

  const isOwner = existingThreads.length > 0;

  if (!isOwner) return [];

  const config = {
    configurable: {
      thread_id: threadId,
    },
  };
  const state = await graph.getState(config);
  const stateRecord = isRecord(state) ? state : {};
  const stateContainer = ["values", "value"].map((key) => stateRecord[key]).find(isRecord) ?? {};
  const rawMessages = stateContainer["messages"];
  const messages = Array.isArray(rawMessages) ? rawMessages.filter(isBaseMessage) : [];
  const serializedMessages = mapChatMessagesToStoredMessages(messages);
  return serializedMessages;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBaseMessage(value: unknown): value is BaseMessage {
  return isRecord(value) && "_getType" in value;
}
