/**
 * Chat service: thread creation, ownership checks, title generation, and
 * message orchestration. Route handlers and pages call this service instead
 * of touching the database or the agent graph directly.
 */

import { db } from "@/db";
import { thread } from "@/db/schema/chat-schema";
import { desc, eq } from "drizzle-orm";
import {
  HumanMessage,
  isBaseMessage,
  mapChatMessagesToStoredMessages,
  type StoredMessage,
} from "@langchain/core/messages";
import { createUIMessageStreamResponse } from "ai";
import { toUIMessageStream } from "@ai-sdk/langchain";
import { agent, type ChatRuntimeContext } from "@/server/chat/agent";
import { deriveThreadTitle } from "@/server/chat/thread-title";
import { assertModelAccess } from "@/server/billing/subscription-service";
import { AppError } from "@/server/lib/app-error";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";
import type { ModelId } from "@/lib/ai/model-registry";

export type ThreadSummary = {
  id: string;
  title: string;
  createdAt: Date;
};

export async function getThreadsForUser(userId: string): Promise<ThreadSummary[]> {
  return db
    .select({ id: thread.id, title: thread.title, createdAt: thread.createdAt })
    .from(thread)
    .where(eq(thread.userId, userId))
    .orderBy(desc(thread.createdAt));
}

/**
 * Creates the thread on first message, or verifies ownership of an existing
 * one. Throws a typed 403 when the thread belongs to someone else.
 */
export async function ensureThreadAccess(params: {
  userId: string;
  threadId: string;
  messageContent: string;
  log?: Logger;
}): Promise<void> {
  const { userId, threadId, messageContent } = params;
  const log = params.log ?? rootLogger;

  const threadsFromDb = await db.select().from(thread).where(eq(thread.id, threadId)).limit(1);
  const existingThread = threadsFromDb[0];

  if (!existingThread) {
    await db.insert(thread).values({
      id: threadId,
      title: deriveThreadTitle(messageContent),
      userId,
    });
    log.info("chat.thread_created", { threadId, userId });
    return;
  }

  if (existingThread.userId !== userId) {
    throw new AppError("FORBIDDEN", "You don't have access to this thread.");
  }
}

export type StreamChatParams = {
  userId: string;
  threadId: string;
  messageContent: string;
  selectedModel: ModelId;
  requestId: string;
};

/**
 * Full chat message orchestration: thread access, model access, agent
 * streaming, and the UI message stream response.
 */
export async function streamChat(params: StreamChatParams): Promise<Response> {
  const { userId, threadId, messageContent, selectedModel, requestId } = params;
  const log = rootLogger.child({ requestId, userId, threadId, modelId: selectedModel });

  await ensureThreadAccess({ userId, threadId, messageContent, log });
  await assertModelAccess(userId, selectedModel, log);

  const context: ChatRuntimeContext = { userId, selectedModel, requestId };

  const stream = await agent.streamEvents(
    { messages: [new HumanMessage(messageContent)] },
    {
      configurable: {
        thread_id: threadId,
      },
      version: "v2",
      context,
    },
  );

  log.info("chat.stream_started");

  return createUIMessageStreamResponse({
    stream: toUIMessageStream(stream),
    headers: { "x-request-id": requestId },
  });
}

/**
 * Loads the persisted conversation for a thread the user owns.
 * Returns an empty history when the thread does not exist or is not theirs.
 */
export async function getThreadHistory(params: {
  userId: string;
  threadId: string;
}): Promise<StoredMessage[]> {
  const { userId, threadId } = params;

  const ownedThreads = await db
    .select({ id: thread.id, userId: thread.userId })
    .from(thread)
    .where(eq(thread.id, threadId))
    .limit(1);

  const ownedThread = ownedThreads[0];
  if (!ownedThread || ownedThread.userId !== userId) return [];

  const state = await agent.getState({
    configurable: {
      thread_id: threadId,
    },
  });

  const stateValues: unknown = state.values;
  const rawMessages = isRecord(stateValues) ? stateValues["messages"] : undefined;
  const messages = Array.isArray(rawMessages) ? rawMessages.filter(isBaseMessage) : [];
  return mapChatMessagesToStoredMessages(messages);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
