/**
 * Thread operations: listing, creation, renaming, archiving, and deletion.
 *
 * Every function takes the acting user's id and enforces ownership through the
 * query itself. The 404-vs-403 distinction is deliberate: a thread that exists
 * but belongs to someone else returns 403, an id that does not exist returns
 * 404, and both are typed errors rather than nulls the caller might ignore.
 */

import { randomUUID } from "node:crypto";
import type { ThreadView } from "@/lib/api/contracts";
import { ensureUserProvisioned } from "@/server/auth/user-service";
import { deriveThreadTitle, FALLBACK_THREAD_TITLE } from "@/server/chat/thread-title";
import * as messageRepository from "@/server/db/message-repository";
import * as threadRepository from "@/server/db/thread-repository";
import type { Page } from "@/server/db/pagination";
import { AppError } from "@/server/lib/app-error";
import type { Logger } from "@/server/lib/logger";
import { assertAccountActive } from "@/server/account/account-deletion-service";

export type ThreadRecord = threadRepository.ThreadRecord;
export type MessageRecord = messageRepository.MessageRecord;
export type MessageSearchRecord = messageRepository.MessageSearchRecord;

/**
 * A page of the user's threads, newest activity first.
 *
 * Deliberately uncached. The obvious cache here is a tagged `unstable_cache`,
 * but the event that invalidates it most often — an assistant reply changing
 * `lastMessageAt`, and so the sidebar's order — is persisted from `waitUntil`,
 * after the route handler has returned its streaming Response. Next flushes a
 * request's pending tag revalidations at that moment, so a `revalidateTag`
 * issued later lands in an array nobody reads again: no error, no invalidation,
 * just a list that is silently up to five minutes stale after every turn. This
 * is one indexed read on an owned index, so the cache was never buying much.
 */
export async function listThreads(params: {
  userId: string;
  cursor?: string | undefined;
  limit?: number | undefined;
  view?: ThreadView;
  pinned?: boolean | undefined;
}): Promise<Page<ThreadRecord>> {
  return threadRepository.listThreads({
    userId: params.userId,
    cursor: params.cursor,
    ...(params.limit === undefined ? {} : { limit: params.limit }),
    ...(params.view === undefined ? {} : { view: params.view }),
    ...(params.pinned === undefined ? {} : { pinned: params.pinned }),
  });
}

/**
 * Loads a thread the user owns, or throws. Used by every per-thread route so
 * the ownership check happens in exactly one place.
 */
export async function requireOwnedThread(params: {
  threadId: string;
  userId: string;
}): Promise<ThreadRecord> {
  const owned = await threadRepository.findThreadForUser(params);
  if (owned) return owned;

  if (await threadRepository.threadExists(params.threadId)) {
    throw new AppError("FORBIDDEN", "You don't have access to this thread.");
  }
  throw new AppError("NOT_FOUND", "That conversation no longer exists.");
}

export async function createThread(params: {
  userId: string;
  id?: string | undefined;
  title?: string | undefined;
  log?: Logger;
}): Promise<ThreadRecord> {
  await assertAccountActive(params.userId);
  const id = params.id ?? randomUUID();

  const existing = await threadRepository.threadExists(id);
  if (existing) {
    throw new AppError("CONFLICT", "A conversation with that id already exists.");
  }

  // See the note in `chat-service.ensureThreadAccess`: the local user row must
  // exist before anything referencing it is inserted.
  await ensureUserProvisioned(params.userId, params.log);

  const created = await threadRepository.createThread({
    id,
    userId: params.userId,
    title: params.title?.trim() || FALLBACK_THREAD_TITLE,
  });

  params.log?.info("thread.created", { threadId: created.id });
  return created;
}

export async function renameThread(params: {
  threadId: string;
  userId: string;
  patch: threadRepository.UpdateThreadInput;
  log?: Logger;
}): Promise<ThreadRecord> {
  await requireOwnedThread({ threadId: params.threadId, userId: params.userId });

  const updated = await threadRepository.updateThread({
    threadId: params.threadId,
    userId: params.userId,
    patch: params.patch,
  });

  if (!updated) {
    throw new AppError("NOT_FOUND", "That conversation no longer exists.");
  }

  params.log?.info("thread.updated", { threadId: updated.id });
  return updated;
}

export async function deleteThread(params: {
  threadId: string;
  userId: string;
  log?: Logger;
}): Promise<void> {
  await requireOwnedThread({ threadId: params.threadId, userId: params.userId });

  const deleted = await threadRepository.deleteThread({
    threadId: params.threadId,
    userId: params.userId,
  });

  if (!deleted) {
    throw new AppError("NOT_FOUND", "That conversation no longer exists.");
  }

  params.log?.info("thread.deleted", { threadId: params.threadId });
}

/**
 * The newest window of a thread, for the page that renders it.
 *
 * Tolerates a thread that does not exist *yet*, which is a real and ordinary
 * state rather than an error: the composer navigates to `/chat/{id}` the
 * moment the first message is sent, and the row is created inside the chat
 * request a beat later — deliberately, because the rate-limit and quota gates
 * run before anything is written. Treating that as a 404 made every new
 * conversation flash an error page.
 *
 * A thread that exists and belongs to someone else is still a 403. The
 * distinction is the point: "not yours" and "not yet" are different answers.
 */
export async function readThreadWindow(params: {
  threadId: string;
  userId: string;
  limit?: number | undefined;
  log?: Logger;
}): Promise<Page<MessageRecord>> {
  const owned = await threadRepository.findThreadForUser({
    threadId: params.threadId,
    userId: params.userId,
  });

  if (owned === null) {
    if (await threadRepository.threadExists(params.threadId)) {
      throw new AppError("FORBIDDEN", "You don't have access to this thread.");
    }
    return { items: [], nextCursor: null };
  }

  return messageRepository.listMessages({
    threadId: params.threadId,
    ...(params.limit === undefined ? {} : { limit: params.limit }),
    ...(params.log === undefined ? {} : { log: params.log }),
  });
}

/** Paginated message history for a thread the user owns. */
export async function listThreadMessages(params: {
  threadId: string;
  userId: string;
  cursor?: string | undefined;
  limit?: number | undefined;
  log?: Logger;
}): Promise<Page<MessageRecord>> {
  await requireOwnedThread({ threadId: params.threadId, userId: params.userId });

  return messageRepository.listMessages({
    threadId: params.threadId,
    cursor: params.cursor,
    ...(params.limit === undefined ? {} : { limit: params.limit }),
    ...(params.log === undefined ? {} : { log: params.log }),
  });
}

/** Full-text search over text parts in messages owned by the acting user. */
export async function searchMessages(params: {
  userId: string;
  query: string;
  cursor?: string | undefined;
  limit?: number | undefined;
  log?: Logger;
}): Promise<Page<MessageSearchRecord>> {
  return messageRepository.searchMessages({
    userId: params.userId,
    query: params.query,
    cursor: params.cursor,
    ...(params.limit === undefined ? {} : { limit: params.limit }),
    ...(params.log === undefined ? {} : { log: params.log }),
  });
}

export { deriveThreadTitle };
