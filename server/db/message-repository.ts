/**
 * Message persistence. The only module that builds message queries.
 *
 * The `parts` column is jsonb, so it is the one place where data can re-enter
 * the app in a shape TypeScript cannot vouch for. Every read parses through
 * `messagePartsSchema` and every write validates before insert, which is what
 * makes the `$type<MessageParts>()` annotation on the column honest rather than
 * aspirational. A row whose parts fail validation is skipped and logged, never
 * surfaced half-typed.
 */

import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { message } from "@/db/schema/chat-schema";
import { isModelId, type ModelId } from "@/lib/ai/model-registry";
import { messagePartsSchema, type MessageParts, type MessageRole } from "@/lib/ai/message-parts";
import { DEFAULT_PAGE_SIZE, decodeCursor, toPage, type Page } from "@/server/db/pagination";
import type { Executor } from "@/server/db/thread-repository";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

export type MessageRecord = {
  id: string;
  threadId: string;
  role: MessageRole;
  parts: MessageParts;
  modelId: ModelId | null;
  inputTokens: number;
  outputTokens: number;
  createdAt: Date;
};

export type CreateMessageInput = {
  id: string;
  threadId: string;
  role: MessageRole;
  parts: MessageParts;
  modelId?: ModelId | null;
  inputTokens?: number;
  outputTokens?: number;
};

export type MessageListOptions = {
  threadId: string;
  limit?: number;
  cursor?: string | undefined;
  log?: Logger;
};

/**
 * Messages in a thread, oldest first, keyset-paginated on
 * `(created_at asc, id asc)` — the shape of `message_thread_id_created_at_idx`.
 * Callers must have already established that the user owns the thread.
 */
export async function listMessages(options: MessageListOptions): Promise<Page<MessageRecord>> {
  const limit = options.limit ?? DEFAULT_PAGE_SIZE;
  const cursor = options.cursor === undefined ? null : decodeCursor(options.cursor);
  const log = options.log ?? rootLogger;

  const rows = await db
    .select()
    .from(message)
    .where(
      and(
        eq(message.threadId, options.threadId),
        cursor === null
          ? undefined
          : or(
              gt(message.createdAt, cursor.sortValue),
              and(eq(message.createdAt, cursor.sortValue), gt(message.id, cursor.id)),
            ),
      ),
    )
    .orderBy(asc(message.createdAt), asc(message.id))
    .limit(limit + 1);

  const records = rows.flatMap((row) => {
    const record = toMessageRecord(row, log);
    return record ? [record] : [];
  });

  return toPage(records, limit, (item) => ({ sortValue: item.createdAt, id: item.id }));
}

export async function appendMessages(
  inputs: CreateMessageInput[],
  executor: Executor = db,
): Promise<void> {
  if (inputs.length === 0) return;

  const values = inputs.map((input) => ({
    id: input.id,
    threadId: input.threadId,
    role: input.role,
    // Validate before the row reaches the database, so the column's declared
    // type and its contents cannot diverge.
    parts: messagePartsSchema.parse(input.parts),
    modelId: input.modelId ?? null,
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
  }));

  await executor.insert(message).values(values);
}

export async function countMessagesInThread(threadId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(message)
    .where(eq(message.threadId, threadId));

  return rows[0]?.count ?? 0;
}

type MessageRow = typeof message.$inferSelect;

/** Returns null for rows whose jsonb no longer matches the parts contract. */
function toMessageRecord(row: MessageRow, log: Logger): MessageRecord | null {
  const parts = messagePartsSchema.safeParse(row.parts);
  if (!parts.success) {
    log.error("message.parts_invalid", { messageId: row.id, threadId: row.threadId });
    return null;
  }

  return {
    id: row.id,
    threadId: row.threadId,
    role: row.role,
    parts: parts.data,
    modelId: isModelId(row.modelId) ? row.modelId : null,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    createdAt: row.createdAt,
  };
}
