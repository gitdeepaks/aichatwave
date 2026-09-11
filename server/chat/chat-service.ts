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
import { z } from "zod";
import { ensureUserProvisioned } from "@/server/auth/user-service";
import { agent } from "@/server/chat/agent";
import { toChatRuntimeContext } from "@/server/chat/runtime-context";
import { deriveThreadTitle } from "@/server/chat/thread-title";
import { persistUserTurn } from "@/server/chat/turn-persistence";
import { onStreamSettled } from "@/server/chat/stream-lifecycle";
import { assertModelAccess, resolvePlan } from "@/server/billing/subscription-service";
import { assertWithinQuota, refundQuota } from "@/server/billing/quota-service";
import {
  acquireChatStreamSlot,
  assertWithinRateLimit,
  maybeSweepRateLimits,
  releaseChatStreamSlot,
} from "@/server/security/rate-limit";
import { assertModelAvailable } from "@/server/ai/model-service";
import * as threadRepository from "@/server/db/thread-repository";
import { AppError } from "@/server/lib/app-error";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";
import type { ModelId } from "@/lib/ai/model-registry";
import { waitUntil } from "@vercel/functions";

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
  /** Null when no proxy header carried one; the per-IP limit is then skipped. */
  clientIp: string | null;
};

/**
 * Full chat message orchestration.
 *
 * The order of the gates is the design, not an accident. Each one is cheaper
 * than the next and rejects a class of request the later ones would have paid
 * to discover:
 *
 *  1. **rate limit** — two indexed upserts, no writes to domain tables. A
 *     burst is refused before it can create a thread or provision a user.
 *  2. **stream slot** — bounds how much in-flight work one account can hold.
 *     Taken before the pre-LLM work (ownership read, memory read, extraction
 *     call) because that work is itself worth containing.
 *  3. **thread access** — ownership, and user provisioning on first message.
 *  4. **availability** then **plan access** — a 503 an operator owns before a
 *     403 the user can fix by upgrading, so an unconfigured provider never
 *     reads as a billing problem.
 *  5. **quota** — the last gate and the only one that reserves something, so
 *     nothing is spent on a turn that a cheaper gate would have refused.
 *
 * Everything after the slot is acquired runs inside a `try` that releases the
 * slot and refunds the reservation, so a failure never leaks either.
 */
export async function streamChat(params: StreamChatParams): Promise<Response> {
  const { messageContent, clientIp } = params;
  // Parsed once, here: past this line `userId`, `threadId` and `requestId` are
  // branded and non-optional, so no node downstream has to defend against a
  // turn that is missing one.
  const context = toChatRuntimeContext(params);
  const { userId, threadId, selectedModel, requestId } = context;
  const log = rootLogger.child({ requestId, userId, threadId, modelId: selectedModel });
  const now = new Date();

  // The plan decides the limits, so it has to be known before the first gate.
  // A warm read is local and costs no Polar call; a stale one is served locally
  // and reconciled behind the response.
  const { resolution, refresh } = await resolvePlan(userId, log);
  if (refresh !== null) waitUntil(refresh());

  await assertWithinRateLimit({
    userId,
    planId: resolution.planId,
    clientIp,
    now,
    log,
  });
  waitUntil(maybeSweepRateLimits(now, log));

  const lease = await acquireChatStreamSlot({ userId, planId: resolution.planId, now, log });
  let reservation: Awaited<ReturnType<typeof assertWithinQuota>> | null = null;

  try {
    await ensureThreadAccess({ userId, threadId, messageContent, log });
    // Availability (is this deployment configured for the model?) before access
    // (does the user's plan include it?): the first is a 503 an operator owns,
    // the second a 403 the user can resolve by upgrading. Checking availability
    // first keeps an unconfigured provider from reading as a billing problem.
    assertModelAvailable(selectedModel);
    assertModelAccess(resolution.planId, selectedModel);

    reservation = await assertWithinQuota({ userId, planId: resolution.planId, now, log });

    // Written before the model runs so the user's message survives a failed or
    // abandoned generation.
    await persistUserTurn({ threadId, content: messageContent, log });

    const stream = await agent.streamEvents(
      { messages: [new HumanMessage(messageContent)] },
      {
        configurable: { thread_id: threadId },
        version: "v2",
        context,
      },
    );

    log.info("chat.stream_started", {
      planId: resolution.planId,
      planSource: resolution.source,
      quotaUsed: reservation.snapshot.used,
      quotaLimit: reservation.snapshot.limit,
      streamSlot: lease.slot,
    });

    return createUIMessageStreamResponse({
      // The slot is held for as long as the answer is actually streaming, and
      // freed the moment it stops — including when the user navigates away
      // mid-answer, which a `finally` around this function would never see.
      stream: onStreamSettled(toUIMessageStream(stream), (outcome) => {
        log.info("chat.stream_settled", { outcome, streamSlot: lease.slot });
        waitUntil(releaseChatStreamSlot(lease, log));
      }),
      headers: {
        "x-request-id": requestId,
        // Lets the composer show remaining messages without a second request.
        "x-quota-remaining": String(reservation.snapshot.remaining),
        "x-quota-limit": String(reservation.snapshot.limit),
      },
    });
  } catch (error) {
    // Nothing streamed, so nothing was spent: give the allowance back and free
    // the slot immediately rather than waiting out the lease TTL.
    if (reservation !== null) await refundQuota(reservation, log);
    await releaseChatStreamSlot(lease, log);
    throw error;
  }
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

  return mapChatMessagesToStoredMessages(await readThreadState(params.threadId));
}

/** A checkpoint value that is a LangChain message, and nothing else. */
const baseMessageSchema = z.custom<BaseMessage>(isBaseMessage);

/**
 * The graph state as this app reads it. `getState` resolves to
 * `Record<string, any>`, so the shape is checked by this schema instead of
 * being trusted: an entry that is not a message is dropped, and a state
 * without a message list reads as an empty conversation.
 */
const threadStateSchema = z
  .object({
    messages: z
      .array(baseMessageSchema.nullable().catch(null))
      .transform((messages) => messages.filter((message) => message !== null))
      .catch([]),
  })
  .catch({ messages: [] });

/**
 * The single place LangGraph state is narrowed: `getState` and its parse live
 * together, so no caller can read the checkpoint without going through the
 * schema, and nothing outward of this function sees an untyped value.
 */
async function readThreadState(threadId: string): Promise<BaseMessage[]> {
  const snapshot = await agent.getState({ configurable: { thread_id: threadId } });
  return threadStateSchema.parse(snapshot.values).messages;
}
