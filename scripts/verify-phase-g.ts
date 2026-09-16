/**
 * Phase G exit-criteria verification, against the live database.
 *
 * The unit tests cover the pure parts — folding chunks into message parts,
 * the size policy, the stream-state algebra. What they cannot cover is whether
 * a turn actually commits in one transaction, whether a stopped stream stays
 * stopped when the generating instance reports its own outcome a moment later,
 * and whether a regenerate replaces its predecessor instead of stacking beside
 * it. Those are database behaviours and they are checked here.
 *
 * Usage: pnpm phase-g:verify
 */

import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";
import { db } from "@/db";
import { message } from "@/db/schema/chat-schema";
import { eq } from "drizzle-orm";
import { commitTurn } from "@/server/chat/turn-commit";
import { createTurnAccumulator, recordChunk } from "@/server/chat/turn-recorder";
import type { TurnRecord } from "@/server/chat/turn-registry";
import { createTurnId } from "@/server/chat/turn-registry";
import {
  abortChatStream,
  appendChatStreamChunk,
  createChatStream,
  findResumableStream,
  listChatStreamChunks,
  readChatStreamState,
  settleChatStream,
} from "@/server/db/chat-stream-repository";
import {
  countAttachmentsForUser,
  createAttachment,
  readAttachmentBytes,
} from "@/server/db/attachment-repository";
import {
  deleteLocalAccountData,
  beginAccountDeletion,
} from "@/server/account/account-deletion-repository";
import { env } from "@/lib/env";

const OWNER_ID = "phase-g-fixture-owner";
const OTHER_ID = "phase-g-fixture-other";
const THREAD_ID = "phase-g-fixture-thread";
const OTHER_THREAD_ID = "phase-g-fixture-other-thread";

type CountRow = { count: number };

async function count(pool: Pool, statement: string, values: string[]): Promise<number> {
  const result = await pool.query<CountRow>(statement, values);
  return result.rows[0]?.count ?? 0;
}

function turn(overrides: Partial<TurnRecord> = {}): TurnRecord {
  return {
    turnId: createTurnId(),
    abortController: new AbortController(),
    streamId: "phase-g-stream",
    threadId: THREAD_ID,
    userId: OWNER_ID,
    userText: "What is in this chart?",
    attachments: [],
    attachmentBlocks: [],
    unavailableAttachments: [],
    replacePrevious: false,
    accumulator: createTurnAccumulator(),
    startedAt: Date.now(),
    modelId: "gpt-5-nano",
    usage: { inputTokens: 120, outputTokens: 45 },
    ...overrides,
  };
}

async function seed(pool: Pool): Promise<void> {
  await pool.query(
    `insert into "user" (id, name, email, email_verified)
     values ($1, 'Phase G owner', 'owner@phase-g.invalid', true),
            ($2, 'Phase G other', 'other@phase-g.invalid', true)`,
    [OWNER_ID, OTHER_ID],
  );
  await pool.query(
    `insert into thread (id, title, user_id)
     values ($1, 'New Chat', $2), ($3, 'Other user thread', $4)`,
    [THREAD_ID, OWNER_ID, OTHER_THREAD_ID, OTHER_ID],
  );
}

/** Exit criterion: a turn's two messages commit in one transaction. */
async function verifyOneTransactionTurn(pool: Pool): Promise<void> {
  const record = turn();
  for (const chunk of [
    { type: "text-start", id: "a" },
    { type: "text-delta", id: "a", delta: "It is a bar chart." },
  ] as const) {
    recordChunk(record.accumulator, chunk);
  }

  const committed = await commitTurn({ record, outcome: "completed" });
  assert.notEqual(committed.userMessageId, null, "the user turn is written");
  assert.notEqual(committed.assistantMessageId, null, "the assistant turn is written");

  const rows = await db
    .select()
    .from(message)
    .where(eq(message.threadId, THREAD_ID))
    .orderBy(message.createdAt);
  assert.equal(rows.length, 2, "exactly one turn, both halves");
  assert.equal(rows[0]?.role, "user");
  assert.equal(rows[1]?.role, "assistant");
  assert.equal(rows[1]?.modelId, "gpt-5-nano");
  assert.equal(rows[1]?.inputTokens, 120);
  assert.equal(rows[1]?.outputTokens, 45);

  // One transaction, but not one timestamp. `created_at` defaults to `now()`,
  // which Postgres resolves to the transaction's start time, so both halves
  // would carry the same value and history — ordered by `(created_at, id)` —
  // would break the tie on a random uuid. That reordered real conversations:
  // an answer could render above the question it answered.
  const ordering = await pool.query<{ role: string }>(
    "select role from message where thread_id = $1 order by created_at, id",
    [THREAD_ID],
  );
  assert.deepEqual(
    ordering.rows.map((row) => row.role),
    ["user", "assistant"],
    "the question sorts before its answer",
  );
  assert.ok(
    (rows[1]?.createdAt.getTime() ?? 0) > (rows[0]?.createdAt.getTime() ?? 0),
    "the answer is stamped after the question, not alongside it",
  );
}

/** Exit criterion: stop persists the partial answer and stops billing. */
async function verifyStopPersistsPartial(): Promise<void> {
  const record = turn({ usage: { inputTokens: 80, outputTokens: 12 } });
  for (const chunk of [
    { type: "text-start", id: "a" },
    { type: "text-delta", id: "a", delta: "Let me look that " },
  ] as const) {
    recordChunk(record.accumulator, chunk);
  }
  recordChunk(record.accumulator, {
    type: "tool-input-available",
    toolCallId: "phase-g-call",
    toolName: "display_weather",
    input: { city: "Mumbai" },
  });

  const committed = await commitTurn({ record, outcome: "aborted" });
  assert.notEqual(committed.assistantMessageId, null);

  const rows = await db
    .select()
    .from(message)
    .where(eq(message.id, committed.assistantMessageId ?? ""));
  const parts = rows[0]?.parts ?? [];
  assert.deepEqual(parts[0], { type: "text", text: "Let me look that " });
  // The unresolved call is kept as unresolved, not silently dropped and not
  // promoted to a result that never came.
  assert.equal(parts[1]?.type, "tool");
  assert.equal(parts[1]?.type === "tool" ? parts[1].state : null, "input-available");
  // Tokens actually spent before the stop are still attributed.
  assert.equal(rows[0]?.outputTokens, 12);
}

/** Exit criterion: no control is a no-op — Retry replaces rather than appends. */
async function verifyRegenerateReplaces(): Promise<void> {
  const before = await db
    .select()
    .from(message)
    .where(eq(message.threadId, THREAD_ID))
    .orderBy(message.createdAt);
  const userCountBefore = before.filter((row) => row.role === "user").length;
  const assistantCountBefore = before.filter((row) => row.role === "assistant").length;
  const supersededId = before.at(-1)?.id ?? "";
  assert.equal(before.at(-1)?.role, "assistant", "the fixture ends on an answer to redo");

  const record = turn({ replacePrevious: true, usage: { inputTokens: 200, outputTokens: 90 } });
  for (const chunk of [
    { type: "text-start", id: "a" },
    { type: "text-delta", id: "a", delta: "A second, better answer." },
  ] as const) {
    recordChunk(record.accumulator, chunk);
  }

  const committed = await commitTurn({ record, outcome: "completed" });
  assert.equal(committed.userMessageId, null, "a regenerate does not re-ask the question");

  const after = await db
    .select()
    .from(message)
    .where(eq(message.threadId, THREAD_ID))
    .orderBy(message.createdAt);

  assert.equal(
    after.filter((row) => row.role === "user").length,
    userCountBefore,
    "the user's messages are untouched",
  );
  assert.equal(after.at(-1)?.role, "assistant");
  assert.deepEqual(after.at(-1)?.parts, [{ type: "text", text: "A second, better answer." }]);

  // Replaced, not stacked: the answer that was redone is gone, and the thread
  // holds no more answers than it did before — earlier turns are untouched.
  assert.equal(
    after.some((row) => row.id === supersededId),
    false,
    "the superseded answer is deleted",
  );
  assert.equal(
    after.filter((row) => row.role === "assistant").length,
    assistantCountBefore,
    "a regenerate adds no answer, it substitutes one",
  );
  assert.equal(
    after.filter(
      (row) =>
        row.role === "assistant" &&
        row.parts.some((part) => part.type === "text" && part.text.startsWith("Let me look that")),
    ).length,
    0,
    "the stopped partial answer was the one replaced",
  );
}

/** Exit criterion: refresh mid-stream resumes the same answer. */
async function verifyResume(): Promise<void> {
  const streamId = "phase-g-live-stream";
  await createChatStream({
    id: streamId,
    threadId: THREAD_ID,
    userId: OWNER_ID,
    modelId: "gpt-5-nano",
    userText: "Tell me a story",
    attachmentIds: [],
  });

  assert.equal(
    await appendChatStreamChunk({
      streamId,
      seq: 0,
      payload: 'data: {"type":"text-start","id":"a"}\n\n',
      at: new Date(),
    }),
    true,
    "a live stream accepts chunks",
  );
  await appendChatStreamChunk({
    streamId,
    seq: 1,
    payload: 'data: {"type":"text-delta","id":"a","delta":"Once"}\n\n',
    at: new Date(),
  });

  const resumable = await findResumableStream({
    threadId: THREAD_ID,
    userId: OWNER_ID,
    now: new Date(),
  });
  assert.equal(resumable?.id, streamId, "the live stream is resumable by its owner");

  // A different user cannot reconnect to it.
  assert.equal(
    await findResumableStream({ threadId: THREAD_ID, userId: OTHER_ID, now: new Date() }),
    null,
    "resume is owner-scoped",
  );

  const replayed = await listChatStreamChunks({ streamId, afterSeq: -1, limit: 10 });
  assert.equal(replayed.length, 2);
  assert.equal(replayed[0]?.seq, 0);
  assert.match(replayed.map((batch) => batch.payload).join(""), /Once/);

  // Resuming from a boundary returns only what the reader has not seen.
  const tail = await listChatStreamChunks({ streamId, afterSeq: 0, limit: 10 });
  assert.equal(tail.length, 1);
  assert.equal(tail[0]?.seq, 1);

  await settleChatStream({ streamId, state: "completed", at: new Date() });
  assert.equal(
    await findResumableStream({ threadId: THREAD_ID, userId: OWNER_ID, now: new Date() }),
    null,
    "a settled stream is not resumable",
  );
}

/**
 * A stop must stick. The generating instance reports its own outcome moments
 * after the stop endpoint writes `aborted`, and without the guard on
 * `settleChatStream` that later write would relabel it a completion.
 */
async function verifyStopIsNotOverwritten(): Promise<void> {
  const streamId = "phase-g-stopped-stream";
  await createChatStream({
    id: streamId,
    threadId: THREAD_ID,
    userId: OWNER_ID,
    modelId: "gpt-5-nano",
    userText: "Write an essay",
    attachmentIds: [],
  });

  assert.equal(await abortChatStream({ streamId, at: new Date() }), true);
  // Stopping an already-stopped stream is not an error, and reports honestly.
  assert.equal(await abortChatStream({ streamId, at: new Date() }), false);

  // The generating instance now notices: its chunk write reports the stream is
  // no longer live, which is how a cross-instance stop reaches the graph.
  assert.equal(
    await appendChatStreamChunk({ streamId, seq: 0, payload: "data: {}\n\n", at: new Date() }),
    false,
    "an aborted stream reports itself no longer live",
  );

  await settleChatStream({ streamId, state: "completed", at: new Date() });
  assert.equal((await readChatStreamState(streamId))?.state, "aborted", "the stop survives");
}

/**
 * Deleting an account must take its files with it.
 *
 * Storing the bytes in Postgres is what makes this a single transaction rather
 * than a local commit plus a remote call that can fail on its own — so the
 * assertion is simply that nothing is left, with no queue to drain first.
 */
async function verifyAttachmentDeletion(pool: Pool): Promise<void> {
  const stored = await createAttachment({
    id: "phase-g-attachment",
    userId: OWNER_ID,
    filename: "chart.png",
    mediaType: "image/png",
    data: Buffer.from([0, 1, 2, 3]),
  });
  // The size is derived from the bytes, never taken from the caller.
  assert.equal(stored.sizeBytes, 4);

  const readBack = await readAttachmentBytes({ attachmentId: stored.id, userId: OWNER_ID });
  assert.deepEqual([...(readBack?.data ?? [])], [0, 1, 2, 3]);

  // And it is not readable by anyone else, which is the whole reason the bytes
  // are behind an ownership-checked route rather than a URL.
  assert.equal(await readAttachmentBytes({ attachmentId: stored.id, userId: OTHER_ID }), null);

  await beginAccountDeletion(OWNER_ID);
  await deleteLocalAccountData(OWNER_ID);

  assert.equal(await countAttachmentsForUser(OWNER_ID), 0, "the file goes with the account");
  assert.equal(
    await count(pool, `select count(*)::int as count from "user" where id = $1`, [OTHER_ID]),
    1,
    "the control user survives",
  );
}

async function cleanup(pool: Pool): Promise<void> {
  await pool.query(`delete from "user" where id in ($1, $2)`, [OWNER_ID, OTHER_ID]);
  await pool.query("delete from account_deletion where user_id in ($1, $2)", [OWNER_ID, OTHER_ID]);
  await pool.query("delete from thread where id in ($1, $2)", [THREAD_ID, OTHER_THREAD_ID]);
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    await cleanup(pool);
    await seed(pool);
    await verifyOneTransactionTurn(pool);
    await verifyStopPersistsPartial();
    await verifyRegenerateReplaces();
    await verifyResume();
    await verifyStopIsNotOverwritten();
    await verifyAttachmentDeletion(pool);
    console.log(
      "Phase G database verification passed: one-transaction turns, stop persistence, regenerate replacement, resumable streams, stop durability, and attachment deletion.",
    );
  } finally {
    await cleanup(pool);
    await pool.end();
  }
}

void main();
