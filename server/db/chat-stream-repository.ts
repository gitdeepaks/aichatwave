/**
 * Persistence for in-flight assistant turns. The only module that builds
 * `chat_stream` and `chat_stream_chunk` queries.
 *
 * The chunk log is append-only and read by `seq`, which is what makes a resume
 * a simple "everything after N" and lets a reconnecting client be caught up
 * without the writer and the reader coordinating.
 */

import { and, asc, desc, eq, gt, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { chatStream, chatStreamChunk, thread } from "@/db/schema/chat-schema";
import { isModelId, type ModelId } from "@/lib/ai/model-registry";
import {
  chatStreamStateSchema,
  STREAM_HEARTBEAT_TIMEOUT_MS,
  type ChatStreamState,
} from "@/lib/chat/stream-state";
import { DEFAULT_MODEL_ID } from "@/lib/ai/model-registry";
import type { Executor } from "@/server/db/thread-repository";

export type ChatStreamRecord = {
  id: string;
  threadId: string;
  userId: string;
  state: ChatStreamState;
  modelId: ModelId;
  userText: string;
  attachmentIds: string[];
  createdAt: Date;
  heartbeatAt: Date;
  firstTokenAt: Date | null;
  settledAt: Date | null;
};

export type CreateChatStreamInput = {
  id: string;
  threadId: string;
  userId: string;
  modelId: ModelId;
  userText: string;
  attachmentIds: string[];
};

export async function createChatStream(input: CreateChatStreamInput): Promise<void> {
  await db.insert(chatStream).values(input);
}

/**
 * Appends one batch of pre-encoded SSE text and bumps the heartbeat.
 *
 * Returns false when the row is no longer `streaming` — which is how the
 * instance producing the answer learns that a stop request landed on another
 * instance and marked the turn aborted.
 */
export async function appendChatStreamChunk(params: {
  streamId: string;
  seq: number;
  payload: string;
  at: Date;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx
      .insert(chatStreamChunk)
      .values({ streamId: params.streamId, seq: params.seq, payload: params.payload })
      // A retry after a network blip must not fail the turn; the batch at a
      // given seq is always the same bytes, so an existing row is the row.
      .onConflictDoNothing();

    const live = await tx
      .update(chatStream)
      .set({ heartbeatAt: params.at })
      .where(and(eq(chatStream.id, params.streamId), eq(chatStream.state, "streaming")))
      .returning({ id: chatStream.id });

    return live.length > 0;
  });
}

/**
 * Stamps the moment the first visible token reached the client.
 *
 * Guarded on the column still being null so a resumed stream, which replays
 * chunks from the log, cannot rewrite the original latency — the user waited
 * once, and that is the number the SLO is about.
 */
export async function markChatStreamFirstToken(params: {
  streamId: string;
  at: Date;
}): Promise<void> {
  await db
    .update(chatStream)
    .set({ firstTokenAt: params.at })
    .where(and(eq(chatStream.id, params.streamId), isNull(chatStream.firstTokenAt)));
}

/**
 * Records how a stream ended, without overwriting an end someone already
 * recorded.
 *
 * The guard matters for stop: the stop endpoint writes `aborted` while the
 * generating instance is still unwinding, and that instance then reports its
 * own outcome moments later. Without `state = 'streaming'` in the predicate,
 * the later write would relabel a deliberate stop as a completion.
 */
export async function settleChatStream(params: {
  streamId: string;
  state: ChatStreamState;
  at: Date;
}): Promise<void> {
  await db
    .update(chatStream)
    .set({ state: params.state, settledAt: params.at, heartbeatAt: params.at })
    .where(and(eq(chatStream.id, params.streamId), eq(chatStream.state, "streaming")));
}

/** Marks a live stream aborted and reports whether it was still live. */
export async function abortChatStream(params: { streamId: string; at: Date }): Promise<boolean> {
  const rows = await db
    .update(chatStream)
    .set({ state: "aborted", settledAt: params.at, heartbeatAt: params.at })
    .where(and(eq(chatStream.id, params.streamId), eq(chatStream.state, "streaming")))
    .returning({ id: chatStream.id });

  return rows.length > 0;
}

/**
 * The newest resumable stream for a thread the user owns, or null.
 *
 * "Resumable" excludes a row whose heartbeat has gone stale: a process killed
 * mid-stream never writes its settled state, and without this check every
 * reconnect to that thread would wait forever for chunks that cannot come.
 */
export async function findResumableStream(params: {
  threadId: string;
  userId: string;
  now: Date;
}): Promise<ChatStreamRecord | null> {
  const rows = await db
    .select({ stream: chatStream })
    .from(chatStream)
    .innerJoin(thread, eq(chatStream.threadId, thread.id))
    .where(
      and(
        eq(chatStream.threadId, params.threadId),
        eq(thread.userId, params.userId),
        eq(chatStream.state, "streaming"),
        gt(chatStream.heartbeatAt, new Date(params.now.getTime() - STREAM_HEARTBEAT_TIMEOUT_MS)),
      ),
    )
    .orderBy(desc(chatStream.createdAt))
    .limit(1);

  const row = rows[0]?.stream;
  return row ? toChatStreamRecord(row) : null;
}

export async function readChatStreamState(streamId: string): Promise<{
  state: ChatStreamState;
  heartbeatAt: Date;
} | null> {
  const rows = await db
    .select({ state: chatStream.state, heartbeatAt: chatStream.heartbeatAt })
    .from(chatStream)
    .where(eq(chatStream.id, streamId))
    .limit(1);

  const row = rows[0];
  return row
    ? { state: chatStreamStateSchema.parse(row.state), heartbeatAt: row.heartbeatAt }
    : null;
}

/** Batches after `afterSeq`, oldest first. The replay and the catch-up poll. */
export async function listChatStreamChunks(params: {
  streamId: string;
  afterSeq: number;
  limit: number;
}): Promise<Array<{ seq: number; payload: string }>> {
  return db
    .select({ seq: chatStreamChunk.seq, payload: chatStreamChunk.payload })
    .from(chatStreamChunk)
    .where(
      and(eq(chatStreamChunk.streamId, params.streamId), gt(chatStreamChunk.seq, params.afterSeq)),
    )
    .orderBy(asc(chatStreamChunk.seq))
    .limit(params.limit);
}

/** Drops settled streams past the retention window, with their chunk log. */
export async function sweepChatStreams(params: { before: Date; limit: number }): Promise<number> {
  const rows = await db
    .select({ id: chatStream.id })
    .from(chatStream)
    .where(and(eq(chatStream.state, "completed"), lt(chatStream.settledAt, params.before)))
    .limit(params.limit);

  if (rows.length === 0) return 0;

  await db.delete(chatStream).where(
    inArray(
      chatStream.id,
      rows.map((row) => row.id),
    ),
  );
  return rows.length;
}

/** Marks every live stream for a user as aborted. Used before account deletion. */
export async function abortLiveStreamsForUser(params: {
  userId: string;
  at: Date;
  executor?: Executor;
}): Promise<void> {
  const executor = params.executor ?? db;
  await executor
    .update(chatStream)
    .set({ state: "aborted", settledAt: params.at })
    .where(and(eq(chatStream.userId, params.userId), eq(chatStream.state, "streaming")));
}

type ChatStreamRow = typeof chatStream.$inferSelect;

/**
 * The column is jsonb, so its declared `string[]` describes the column to
 * Drizzle and proves nothing about what is in it. Parsed on the way out for
 * the same reason `message.parts` is, with a fallback rather than a throw: a
 * malformed list should cost the turn its attachments, not make the row
 * unreadable.
 */
const attachmentIdsSchema = z.array(z.string().min(1)).catch([]);

function toChatStreamRecord(row: ChatStreamRow): ChatStreamRecord {
  return {
    id: row.id,
    threadId: row.threadId,
    userId: row.userId,
    state: chatStreamStateSchema.parse(row.state),
    // The column is plain text so a model retired from the registry does not
    // make an old row unreadable; an unknown id degrades to the default rather
    // than throwing while replaying someone's history.
    modelId: isModelId(row.modelId) ? row.modelId : DEFAULT_MODEL_ID,
    userText: row.userText,
    attachmentIds: attachmentIdsSchema.parse(row.attachmentIds),
    createdAt: row.createdAt,
    heartbeatAt: row.heartbeatAt,
    firstTokenAt: row.firstTokenAt,
    settledAt: row.settledAt,
  };
}
