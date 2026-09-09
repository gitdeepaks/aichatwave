/**
 * Chat service: thread creation, ownership checks, and message orchestration.
 * Route handlers and pages call this service instead of touching the database
 * or the agent graph directly.
 */

import {
  HumanMessage,
  isBaseMessage,
  mapChatMessagesToStoredMessages,
  type BaseMessage,
  type StoredMessage,
} from "@langchain/core/messages";
import { createUIMessageStreamResponse } from "ai";
import { toUIMessageStream } from "@ai-sdk/langchain";
import { ensureUserProvisioned } from "@/server/auth/user-service";
import { agent } from "@/server/chat/agent";
import type { ChatRuntimeContext } from "@/server/chat/runtime-context";
import { deriveThreadTitle } from "@/server/chat/thread-title";
import { persistUserTurn } from "@/server/chat/turn-persistence";
import { assertModelAccess } from "@/server/billing/subscription-service";
import * as threadRepository from "@/server/db/thread-repository";
import { AppError } from "@/server/lib/app-error";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";
import type { ModelId } from "@/lib/ai/model-registry";

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

  const owned = await threadRepository.findThreadForUser({ threadId, userId });
  if (owned) return;

  if (await threadRepository.threadExists(threadId)) {
    throw new AppError("FORBIDDEN", "You don't have access to this thread.");
  }

  // `thread.user_id` references `user.id`, and Clerk's `user.created` webhook is
  // asynchronous — a user who signs up and immediately sends a message can beat
  // it here. Provision on the write path so the foreign key always holds.
  await ensureUserProvisioned(userId, log);

  await threadRepository.createThread({
    id: threadId,
    title: deriveThreadTitle(messageContent),
    userId,
  });
  log.info("chat.thread_created", { threadId, userId });
}

export type StreamChatParams = {
  userId: string;
  threadId: string;
  messageContent: string;
  selectedModel: ModelId;
  requestId: string;
};

/**
 * Full chat message orchestration: thread access, model access, durable
 * persistence of the user's turn, agent streaming, and the UI message stream
 * response.
 */
export async function streamChat(params: StreamChatParams): Promise<Response> {
  const { userId, threadId, messageContent, selectedModel, requestId } = params;
  const log = rootLogger.child({ requestId, userId, threadId, modelId: selectedModel });

  await ensureThreadAccess({ userId, threadId, messageContent, log });
  await assertModelAccess(userId, selectedModel, log);

  // Written before the model runs so the user's message survives a failed or
  // abandoned generation.
  await persistUserTurn({ threadId, content: messageContent, log });

  const context: ChatRuntimeContext = { userId, threadId, selectedModel, requestId };

  const stream = await agent.streamEvents(
    { messages: [new HumanMessage(messageContent)] },
    {
      configurable: { thread_id: threadId },
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
  const owned = await threadRepository.findThreadForUser(params);
  if (!owned) return [];

  const state = await agent.getState({
    configurable: { thread_id: params.threadId },
  });

  return mapChatMessagesToStoredMessages(readStateMessages(state.values));
}

/**
 * The single place LangGraph state is narrowed. `getState` returns state whose
 * shape the type system cannot know, so it is parsed here and nothing outward
 * of this function ever sees `unknown`.
 */
function readStateMessages(values: unknown): BaseMessage[] {
  if (typeof values !== "object" || values === null) return [];
  if (!("messages" in values)) return [];
  const messages = values.messages;
  return Array.isArray(messages) ? messages.filter(isBaseMessage) : [];
}
