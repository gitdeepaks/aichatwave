/**
 * Writing a completed turn.
 *
 * Both halves of a turn — the user's message and the assistant's — commit in
 * one transaction, which is work item 3 of Phase G. It was not possible
 * before: the assistant's half is produced inside a stream that outlives the
 * request, so the two halves were written from two places at two times, and a
 * turn could end up half-recorded in a way nothing detected. Accumulating the
 * assistant's half from the stream (`turn-recorder.ts`) is what brings both
 * halves into the same moment.
 *
 * "Completed" here means *settled*, not successful. A stopped generation
 * commits exactly what was streamed before the stop, which is the honest
 * record: the tokens were spent, the user saw the text, and losing it because
 * the turn did not finish would be the worse failure.
 */

import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { message } from "@/db/schema/chat-schema";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { hasRenderableContent, type MessageParts } from "@/lib/ai/message-parts";
import type { ChatStreamState } from "@/lib/chat/stream-state";
import { toFilePart } from "@/server/chat/attachment-service";
import { toMessageParts } from "@/server/chat/turn-recorder";
import type { TurnRecord } from "@/server/chat/turn-registry";
import { claimAttachmentsForThread } from "@/server/db/attachment-repository";
import { appendMessages } from "@/server/db/message-repository";
import { touchThread } from "@/server/db/thread-repository";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

export type CommittedTurn = {
  userMessageId: string | null;
  assistantMessageId: string | null;
};

/**
 * Commits a settled turn. Never throws.
 *
 * Persistence failure must not become the user's problem at this point — the
 * answer has already been delivered in full, and there is nothing left to fail
 * into. It is logged loudly instead, because a turn missing from history is a
 * real defect even when it is invisible to the person who saw the answer.
 */
export async function commitTurn(params: {
  record: TurnRecord;
  outcome: ChatStreamState;
  log?: Logger;
}): Promise<CommittedTurn> {
  const log = params.log ?? rootLogger;
  const { record } = params;

  const assistantParts = toMessageParts(record.accumulator);
  const userParts: MessageParts = [
    ...(record.userText.trim().length > 0
      ? [{ type: "text" as const, text: record.userText }]
      : []),
    ...record.attachments.map(toFilePart),
  ];

  const userMessageId = hasRenderableContent(userParts) ? randomUUID() : null;
  const assistantMessageId = hasRenderableContent(assistantParts) ? randomUUID() : null;

  if (userMessageId === null && assistantMessageId === null) {
    log.warn("chat.turn_empty", { threadId: record.threadId, outcome: params.outcome });
    return { userMessageId: null, assistantMessageId: null };
  }

  // Ordered explicitly, one millisecond apart. `created_at` defaults to
  // `now()`, which Postgres resolves to the transaction's start time and is
  // therefore identical for both halves of a turn — and history is ordered by
  // `(created_at, id)`, so the tie would be broken by a random uuid and the
  // answer could sort above its own question.
  const committedAt = new Date();
  const assistantAt = new Date(committedAt.getTime() + 1);

  try {
    await db.transaction(async (tx) => {
      // A regenerate replaces the answer it was asked to redo rather than
      // stacking a second one beside it, and it does not re-write the user's
      // message — the question did not change, only the answer.
      if (record.replacePrevious) {
        await deleteMessagesAfterLastUser(tx, record.threadId);
      }

      await appendMessages(
        [
          ...(userMessageId === null || record.replacePrevious
            ? []
            : [
                {
                  id: userMessageId,
                  threadId: record.threadId,
                  role: "user" as const,
                  parts: userParts,
                  createdAt: committedAt,
                },
              ]),
          ...(assistantMessageId === null
            ? []
            : [
                {
                  id: assistantMessageId,
                  threadId: record.threadId,
                  role: "assistant" as const,
                  parts: assistantParts,
                  modelId: record.modelId,
                  inputTokens: record.usage.inputTokens,
                  outputTokens: record.usage.outputTokens,
                  createdAt: assistantAt,
                },
              ]),
        ],
        tx,
      );

      await claimAttachmentsForThread(
        {
          attachmentIds: record.attachments.map((attachment) => attachment.id),
          userId: record.userId,
          threadId: record.threadId,
        },
        tx,
      );

      await touchThread({ threadId: record.threadId, at: assistantAt }, tx);
    });

    log.info("chat.turn_committed", {
      threadId: record.threadId,
      outcome: params.outcome,
      wroteUser: userMessageId !== null && !record.replacePrevious,
      wroteAssistant: assistantMessageId !== null,
      assistantParts: assistantParts.length,
      attachments: record.attachments.length,
      inputTokens: record.usage.inputTokens,
      outputTokens: record.usage.outputTokens,
    });
  } catch (error) {
    log.error("chat.turn_commit_failed", { threadId: record.threadId }, error);
    return { userMessageId: null, assistantMessageId: null };
  }

  return {
    userMessageId: record.replacePrevious ? null : userMessageId,
    assistantMessageId,
  };
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Clears everything a regenerate is about to supersede: every message at or
 * after the newest user message's timestamp, except that message itself.
 *
 * Keyed on the last user message rather than on "the last assistant message"
 * because a turn can persist several assistant-side rows in principle, and
 * because a thread whose last message is the user's (an abandoned turn) then
 * needs no deletion at all rather than a special case.
 */
async function deleteMessagesAfterLastUser(tx: Transaction, threadId: string): Promise<void> {
  const [lastUser] = await tx
    .select({ id: message.id, createdAt: message.createdAt })
    .from(message)
    .where(and(eq(message.threadId, threadId), eq(message.role, "user")))
    .orderBy(desc(message.createdAt), desc(message.id))
    .limit(1);

  if (!lastUser) return;

  const doomed = await tx
    .select({ id: message.id })
    .from(message)
    .where(and(eq(message.threadId, threadId), gte(message.createdAt, lastUser.createdAt)));

  const ids = doomed.map((row) => row.id).filter((id) => id !== lastUser.id);
  if (ids.length === 0) return;

  await tx.delete(message).where(inArray(message.id, ids));
}
