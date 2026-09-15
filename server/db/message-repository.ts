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

import { and, asc, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { message, thread } from "@/db/schema/chat-schema";
import { isModelId, type ModelId } from "@/lib/ai/model-registry";
import { messagePartsSchema, type MessageParts, type MessageRole } from "@/lib/ai/message-parts";
import {
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  type Cursor,
  type Page,
} from "@/server/db/pagination";
import type { Executor, ThreadRecord } from "@/server/db/thread-repository";
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

export type MessageSearchRecord = {
  thread: ThreadRecord;
  message: MessageRecord;
};

export type MessageSearchOptions = {
  userId: string;
  query: string;
  limit?: number;
  cursor?: string | undefined;
  log?: Logger;
};

export type ExportMessageCursor = { createdAt: Date; id: string };

export async function completeToolCall(params: {
  threadId: string;
  toolCallId: string;
  output: MessageParts[number] extends infer Part
    ? Part extends { type: "tool"; output: infer Output }
      ? Output
      : never
    : never;
  errorText: string | null;
  log?: Logger;
}): Promise<boolean> {
  const log = params.log ?? rootLogger;
  const [row] = await db
    .select({ id: message.id, parts: message.parts })
    .from(message)
    .where(
      and(
        eq(message.threadId, params.threadId),
        eq(message.role, "assistant"),
        sql`${message.parts} @> ${JSON.stringify([
          { type: "tool", toolCallId: params.toolCallId },
        ])}::jsonb`,
      ),
    )
    .orderBy(desc(message.createdAt), desc(message.id))
    .limit(1);

  if (!row) return false;
  const parts = messagePartsSchema.safeParse(row.parts);
  if (!parts.success) {
    log.error("message.invalid_parts", { messageId: row.id }, parts.error);
    return false;
  }

  const updated = parts.data.map((part) =>
    part.type === "tool" && part.toolCallId === params.toolCallId
      ? {
          ...part,
          state:
            params.errorText === null ? ("output-available" as const) : ("output-error" as const),
          output: params.output,
          errorText: params.errorText,
        }
      : part,
  );
  await db
    .update(message)
    .set({ parts: messagePartsSchema.parse(updated) })
    .where(eq(message.id, row.id));
  return true;
}

/** A bounded chronological page for streaming exports. */
export async function listMessagesForExport(params: {
  threadId: string;
  after: ExportMessageCursor | null;
  limit: number;
  log?: Logger;
}): Promise<{ items: MessageRecord[]; next: ExportMessageCursor | null }> {
  const log = params.log ?? rootLogger;
  let boundary = params.after;
  const records: MessageRecord[] = [];
  let exhausted = false;

  while (records.length < params.limit) {
    const rows = await db
      .select()
      .from(message)
      .where(
        and(
          eq(message.threadId, params.threadId),
          boundary === null
            ? undefined
            : or(
                gt(message.createdAt, boundary.createdAt),
                and(eq(message.createdAt, boundary.createdAt), gt(message.id, boundary.id)),
              ),
        ),
      )
      .orderBy(asc(message.createdAt), asc(message.id))
      .limit(params.limit);

    for (const row of rows) {
      boundary = { createdAt: row.createdAt, id: row.id };
      const record = toMessageRecord(row, log);
      if (record) records.push(record);
    }
    if (rows.length < params.limit) {
      exhausted = true;
      break;
    }
  }

  return { items: records, next: exhausted ? null : boundary };
}

/**
 * The newest bounded page of messages, or the page immediately before a
 * cursor. Database rows are read newest-first for keyset pagination and then
 * returned chronologically for rendering. Callers must have already
 * established that the user owns the thread.
 */
export async function listMessages(options: MessageListOptions): Promise<Page<MessageRecord>> {
  const limit = options.limit ?? DEFAULT_PAGE_SIZE;
  let boundary = options.cursor === undefined ? null : decodeCursor(options.cursor);
  const log = options.log ?? rootLogger;
  const records: MessageRecord[] = [];
  const batchSize = Math.max(limit + 1, DEFAULT_PAGE_SIZE);

  while (records.length <= limit) {
    const rows = await db
      .select()
      .from(message)
      .where(and(eq(message.threadId, options.threadId), beforeCursor(boundary)))
      .orderBy(desc(message.createdAt), desc(message.id))
      .limit(batchSize);

    for (const row of rows) {
      boundary = { sortValue: row.createdAt, id: row.id };
      const record = toMessageRecord(row, log);
      if (record) records.push(record);
      if (records.length > limit) break;
    }

    if (records.length > limit || rows.length < batchSize) break;
  }

  const descendingPage = records.slice(0, limit);
  const oldest = descendingPage.at(-1);
  const nextCursor =
    records.length > limit && oldest
      ? encodeCursor({ sortValue: oldest.createdAt, id: oldest.id })
      : null;

  return { items: descendingPage.reverse(), nextCursor };
}

/** User-scoped full-text search over the generated vector of text parts only. */
export async function searchMessages(
  options: MessageSearchOptions,
): Promise<Page<MessageSearchRecord>> {
  const limit = options.limit ?? DEFAULT_PAGE_SIZE;
  let boundary = options.cursor === undefined ? null : decodeCursor(options.cursor);
  const log = options.log ?? rootLogger;
  const records: MessageSearchRecord[] = [];
  const batchSize = Math.max(limit + 1, DEFAULT_PAGE_SIZE);
  const searchQuery = sql`websearch_to_tsquery('simple', ${options.query})`;

  while (records.length <= limit) {
    const rows = await db
      .select({ message, thread })
      .from(message)
      .innerJoin(thread, eq(message.threadId, thread.id))
      .where(
        and(
          eq(thread.userId, options.userId),
          sql`${message.searchVector} @@ ${searchQuery}`,
          beforeCursor(boundary),
        ),
      )
      .orderBy(desc(message.createdAt), desc(message.id))
      .limit(batchSize);

    for (const row of rows) {
      boundary = { sortValue: row.message.createdAt, id: row.message.id };
      const messageRecord = toMessageRecord(row.message, log);
      if (messageRecord) {
        records.push({ message: messageRecord, thread: toThreadRecord(row.thread) });
      }
      if (records.length > limit) break;
    }

    if (records.length > limit || rows.length < batchSize) break;
  }

  const items = records.slice(0, limit);
  const last = items.at(-1);
  const nextCursor =
    records.length > limit && last
      ? encodeCursor({ sortValue: last.message.createdAt, id: last.message.id })
      : null;

  return { items, nextCursor };
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
type ThreadRow = typeof thread.$inferSelect;

function beforeCursor(cursor: Cursor | null) {
  return cursor === null
    ? undefined
    : or(
        lt(message.createdAt, cursor.sortValue),
        and(eq(message.createdAt, cursor.sortValue), lt(message.id, cursor.id)),
      );
}

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

function toThreadRecord(row: ThreadRow): ThreadRecord {
  return {
    id: row.id,
    title: row.title,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastMessageAt: row.lastMessageAt,
    archivedAt: row.archivedAt,
    pinnedAt: row.pinnedAt,
  };
}
