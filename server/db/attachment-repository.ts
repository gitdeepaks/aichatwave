/**
 * Attachment persistence. The only module that builds attachment queries.
 *
 * Every read is user-scoped in the query itself, the same way the thread
 * repository is: an attachment is a private file, and an ownership check a
 * caller could forget to write is not one.
 *
 * The bytes live in the row, so deleting an attachment is one statement inside
 * whatever transaction the caller already holds — there is no second system to
 * reconcile with and nothing to queue.
 */

import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { attachment, thread } from "@/db/schema/chat-schema";
import type { Executor } from "@/server/db/thread-repository";

/** Metadata only. The bytes are fetched separately, by the two callers that need them. */
export type AttachmentRecord = {
  id: string;
  userId: string;
  threadId: string | null;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: Date;
};

export type CreateAttachmentInput = {
  id: string;
  userId: string;
  filename: string;
  mediaType: string;
  data: Buffer;
};

/**
 * `size_bytes` is derived from the bytes rather than taken from the caller, so
 * the recorded size and the stored file cannot disagree — the size is what
 * quota and policy decisions are made from.
 */
export async function createAttachment(input: CreateAttachmentInput): Promise<AttachmentRecord> {
  const rows = await db
    .insert(attachment)
    .values({
      id: input.id,
      userId: input.userId,
      filename: input.filename,
      mediaType: input.mediaType,
      data: input.data,
      sizeBytes: input.data.byteLength,
    })
    .returning({
      id: attachment.id,
      userId: attachment.userId,
      threadId: attachment.threadId,
      filename: attachment.filename,
      mediaType: attachment.mediaType,
      sizeBytes: attachment.sizeBytes,
      createdAt: attachment.createdAt,
    });

  const row = rows[0];
  if (!row) throw new Error(`Insert of attachment ${input.id} returned no row.`);
  return row;
}

/**
 * Metadata for an attachment the user owns; null otherwise.
 *
 * Deliberately does not select `data`: most callers want to know whether the
 * file exists and what it is, and pulling three megabytes to answer that would
 * be wasteful on a path that runs on every render of a conversation.
 */
export async function findAttachmentForUser(params: {
  attachmentId: string;
  userId: string;
}): Promise<AttachmentRecord | null> {
  const rows = await db
    .select({
      id: attachment.id,
      userId: attachment.userId,
      threadId: attachment.threadId,
      filename: attachment.filename,
      mediaType: attachment.mediaType,
      sizeBytes: attachment.sizeBytes,
      createdAt: attachment.createdAt,
    })
    .from(attachment)
    .where(and(eq(attachment.id, params.attachmentId), eq(attachment.userId, params.userId)))
    .limit(1);

  return rows[0] ?? null;
}

export type AttachmentBytes = AttachmentRecord & { data: Buffer };

/** The file itself, for the route that serves it and the turn that sends it to a model. */
export async function readAttachmentBytes(params: {
  attachmentId: string;
  userId: string;
}): Promise<AttachmentBytes | null> {
  const rows = await db
    .select()
    .from(attachment)
    .where(and(eq(attachment.id, params.attachmentId), eq(attachment.userId, params.userId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    threadId: row.threadId,
    filename: row.filename,
    mediaType: row.mediaType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    data: row.data,
  };
}

/**
 * Metadata for a set of ids, in the order the ids were given.
 *
 * Order matters: it is the order the user attached the files, the order they
 * are shown in, and the order they are handed to the model. A plain `inArray`
 * returns rows in whatever order Postgres likes, so the caller's order is
 * reimposed here rather than being lost and silently reshuffled.
 */
export async function listAttachmentsForUser(params: {
  attachmentIds: string[];
  userId: string;
}): Promise<AttachmentRecord[]> {
  if (params.attachmentIds.length === 0) return [];

  const rows = await db
    .select({
      id: attachment.id,
      userId: attachment.userId,
      threadId: attachment.threadId,
      filename: attachment.filename,
      mediaType: attachment.mediaType,
      sizeBytes: attachment.sizeBytes,
      createdAt: attachment.createdAt,
    })
    .from(attachment)
    .where(and(inArray(attachment.id, params.attachmentIds), eq(attachment.userId, params.userId)));

  const byId = new Map(rows.map((row) => [row.id, row]));
  return params.attachmentIds
    .map((id) => byId.get(id))
    .filter((record): record is AttachmentRecord => record !== undefined);
}

/** Binds uploads to the thread whose turn carries them, once that turn commits. */
export async function claimAttachmentsForThread(
  params: { attachmentIds: string[]; userId: string; threadId: string },
  executor: Executor = db,
): Promise<void> {
  if (params.attachmentIds.length === 0) return;

  await executor
    .update(attachment)
    .set({ threadId: params.threadId })
    .where(and(inArray(attachment.id, params.attachmentIds), eq(attachment.userId, params.userId)));
}

/**
 * Drops uploads that were never attached to a message.
 *
 * A user can pick a file and then close the tab, which leaves stored bytes
 * with no message referencing them. These are identified by a null `thread_id`
 * past a grace period long enough that a slow composer is never caught.
 */
export async function deleteOrphanedAttachments(params: {
  before: Date;
  limit: number;
}): Promise<number> {
  const candidates = await db
    .select({ id: attachment.id })
    .from(attachment)
    .where(and(isNull(attachment.threadId), lt(attachment.createdAt, params.before)))
    .limit(params.limit);

  if (candidates.length === 0) return 0;

  await db.delete(attachment).where(
    inArray(
      attachment.id,
      candidates.map((row) => row.id),
    ),
  );
  return candidates.length;
}

export async function countAttachmentsForUser(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attachment)
    .where(eq(attachment.userId, userId));
  return rows[0]?.count ?? 0;
}

export async function countAttachmentsOnUserThreads(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attachment)
    .innerJoin(thread, eq(attachment.threadId, thread.id))
    .where(eq(thread.userId, userId));
  return rows[0]?.count ?? 0;
}
