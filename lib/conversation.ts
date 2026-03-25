import { db } from "@/db";
import { thread } from "@/db/schema/chat-schema";
import { mapChatMessagesToStoredMessages, type BaseMessage } from "@langchain/core/messages";
import { and, eq } from "drizzle-orm";

export const getConversationHistory = async ({
  graph,
  threadId,
  userId,
}: {
  graph: any;
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
  const stateRecord = (state && typeof state === "object" ? state : {}) as Record<string, unknown>;
  const stateContainer = (["values", "value"]
    .map((key) => stateRecord[key])
    .find((candidate) => candidate && typeof candidate === "object") ?? {}) as Record<string, unknown>;
  const rawMessages = stateContainer["messages"];
  const messages = Array.isArray(rawMessages) ? (rawMessages as BaseMessage[]) : [];
  const serializedMessages = mapChatMessagesToStoredMessages(messages);
  return serializedMessages;
};
