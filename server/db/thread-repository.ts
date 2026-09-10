/**
 * Thread persistence. The only module that builds thread queries.
 *
 * Repositories return domain records, never Drizzle row types, so a schema
 * change surfaces here and nowhere else. Ownership is expressed in the query
 * (`where user_id = ?`) rather than checked after the fact, so a caller cannot
 * forget it.
 */

import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db, type Database } from "@/db";
import { thread } from "@/db/schema/chat-schema";
import { DEFAULT_PAGE_SIZE, decodeCursor, toPage, type Page } from "@/server/db/pagination";

export type ThreadRecord = {
  id: string;
  title: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
  archivedAt: Date | null;
  pinnedAt: Date | null;
};

export type ThreadListOptions = {
  userId: string;
  limit?: number;
  cursor?: string | undefined;
  includeArchived?: boolean;
};

export type CreateThreadInput = {
  id: string;
  userId: string;
  title: string;
};

/**
 * A patch: an absent field means "leave it alone". Written with explicit
 * `| undefined` because the request schemas that produce these carry it, and
 * under `exactOptionalPropertyTypes` "absent" and "present and undefined" are
 * different types.
 */
export type UpdateThreadInput = {
  title?: string | undefined;
  archived?: boolean | undefined;
  pinned?: boolean | undefined;
};

/** Runs inside a transaction when one is supplied, otherwise on the pool. */
export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Threads for a user, newest activity first, keyset-paginated on
 * `(updated_at desc, id desc)` — the exact shape of
 * `thread_user_id_updated_at_idx`.
 */
export async function listThreads(options: ThreadListOptions): Promise<Page<ThreadRecord>> {
  const limit = options.limit ?? DEFAULT_PAGE_SIZE;
  const cursor = options.cursor === undefined ? null : decodeCursor(options.cursor);

  const rows = await db
    .select()
    .from(thread)
    .where(
      and(
        eq(thread.userId, options.userId),
        options.includeArchived === true ? undefined : isNull(thread.archivedAt),
        cursor === null
          ? undefined
          : or(
              lt(thread.updatedAt, cursor.sortValue),
              and(eq(thread.updatedAt, cursor.sortValue), lt(thread.id, cursor.id)),
            ),
      ),
    )
    .orderBy(desc(thread.updatedAt), desc(thread.id))
    .limit(limit + 1);

  return toPage(rows.map(toThreadRecord), limit, (item) => ({
    sortValue: item.updatedAt,
    id: item.id,
  }));
}

/** Returns the thread only when it belongs to `userId`; null otherwise. */
export async function findThreadForUser(params: {
  threadId: string;
  userId: string;
}): Promise<ThreadRecord | null> {
  const rows = await db
    .select()
    .from(thread)
    .where(and(eq(thread.id, params.threadId), eq(thread.userId, params.userId)))
    .limit(1);

  const row = rows[0];
  return row ? toThreadRecord(row) : null;
}

/** Existence check that deliberately ignores ownership, for 404-vs-403 decisions. */
export async function threadExists(threadId: string): Promise<boolean> {
  const rows = await db
    .select({ id: thread.id })
    .from(thread)
    .where(eq(thread.id, threadId))
    .limit(1);
  return rows.length > 0;
}

export async function createThread(
  input: CreateThreadInput,
  executor: Executor = db,
): Promise<ThreadRecord> {
  const rows = await executor
    .insert(thread)
    .values({ id: input.id, userId: input.userId, title: input.title })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error(`Insert of thread ${input.id} returned no row.`);
  }
  return toThreadRecord(row);
}

export async function updateThread(params: {
  threadId: string;
  userId: string;
  patch: UpdateThreadInput;
}): Promise<ThreadRecord | null> {
  const now = new Date();
  const rows = await db
    .update(thread)
    .set({
      ...(params.patch.title === undefined ? {} : { title: params.patch.title }),
      ...(params.patch.archived === undefined
        ? {}
        : { archivedAt: params.patch.archived ? now : null }),
      ...(params.patch.pinned === undefined ? {} : { pinnedAt: params.patch.pinned ? now : null }),
      updatedAt: now,
    })
    .where(and(eq(thread.id, params.threadId), eq(thread.userId, params.userId)))
    .returning();

  const row = rows[0];
  return row ? toThreadRecord(row) : null;
}

/** Returns true when a row was deleted, false when the user did not own it. */
export async function deleteThread(params: { threadId: string; userId: string }): Promise<boolean> {
  const rows = await db
    .delete(thread)
    .where(and(eq(thread.id, params.threadId), eq(thread.userId, params.userId)))
    .returning({ id: thread.id });

  return rows.length > 0;
}

/** Marks activity on a thread so the sidebar can order by real use. */
export async function touchThread(
  params: { threadId: string; at: Date },
  executor: Executor = db,
): Promise<void> {
  await executor
    .update(thread)
    .set({ lastMessageAt: params.at, updatedAt: params.at })
    .where(eq(thread.id, params.threadId));
}

export async function countThreads(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(thread)
    .where(eq(thread.userId, userId));

  return rows[0]?.count ?? 0;
}

type ThreadRow = typeof thread.$inferSelect;

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
