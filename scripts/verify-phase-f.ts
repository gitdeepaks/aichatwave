import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";
import {
  beginAccountDeletion,
  deleteLocalAccountData,
} from "@/server/account/account-deletion-repository";
import {
  completeToolCall,
  listMessages,
  listMessagesForExport,
  searchMessages,
} from "@/server/db/message-repository";
import { acquireStreamLeaseForActiveAccount } from "@/server/db/rate-limit-repository";
import { env } from "@/lib/env";

const OWNER_ID = "phase-f-fixture-owner";
const OTHER_ID = "phase-f-fixture-other";
const OWNER_THREAD_ID = "phase-f-fixture-thread";
const OTHER_THREAD_ID = "phase-f-fixture-other-thread";

type CountRow = { count: number };
type PlanRow = { "QUERY PLAN": string };

async function count(pool: Pool, statement: string, value: string): Promise<number> {
  const result = await pool.query<CountRow>(statement, [value]);
  return result.rows[0]?.count ?? 0;
}

async function seed(pool: Pool): Promise<void> {
  await pool.query(
    `insert into "user" (id, name, email, email_verified)
     values ($1, 'Phase F owner', 'owner@phase-f.invalid', true),
            ($2, 'Phase F other', 'other@phase-f.invalid', true)`,
    [OWNER_ID, OTHER_ID],
  );
  await pool.query(
    `insert into thread (id, title, user_id)
     values ($1, 'Five hundred messages', $2), ($3, 'Other user thread', $4)`,
    [OWNER_THREAD_ID, OWNER_ID, OTHER_THREAD_ID, OTHER_ID],
  );
  await pool.query(
    `insert into message (id, thread_id, role, parts, created_at)
     select 'phase-f-message-' || lpad(value::text, 3, '0'), $1, 'user',
            jsonb_build_array(jsonb_build_object(
              'type', 'text',
              'text', case when value % 50 = 0 then 'phasefneedle ' || value else 'message ' || value end
            )),
            timestamptz '2026-01-01 00:00:00+00' + value * interval '1 second'
     from generate_series(0, 499) value`,
    [OWNER_THREAD_ID],
  );
  await pool.query(
    `insert into message (id, thread_id, role, parts)
     values ('phase-f-other-message', $1, 'user', '[{"type":"text","text":"phasefneedle private"}]')`,
    [OTHER_THREAD_ID],
  );
  await pool.query(
    `insert into message (id, thread_id, role, parts)
     values ('phase-f-tool-message', $1, 'assistant',
       '[{"type":"tool","toolCallId":"phase-f-call","toolName":"search","state":"input-available","input":{"query":"fixture"},"output":null,"errorText":null}]')`,
    [OTHER_THREAD_ID],
  );
  await pool.query(
    `insert into message (id, thread_id, role, parts, created_at)
     select 'phase-f-noise-' || lpad(value::text, 5, '0'), $1, 'user',
            jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'unrelated noise ' || value)),
            timestamptz '2025-01-01 00:00:00+00' + value * interval '1 second'
     from generate_series(1, 20000) value`,
    [OTHER_THREAD_ID],
  );
  await pool.query("analyze message");

  for (const threadId of [OWNER_THREAD_ID, OTHER_THREAD_ID]) {
    await pool.query(
      `insert into checkpoints (thread_id, checkpoint_id, checkpoint, metadata)
       values ($1, 'checkpoint', '{}', '{}')`,
      [threadId],
    );
    await pool.query(
      `insert into checkpoint_blobs (thread_id, channel, version, type, blob)
       values ($1, 'messages', '1', 'json', decode('00', 'hex'))`,
      [threadId],
    );
    await pool.query(
      `insert into checkpoint_writes (thread_id, checkpoint_id, task_id, idx, channel, type, blob)
       values ($1, 'checkpoint', 'task', 0, 'messages', 'json', decode('00', 'hex'))`,
      [threadId],
    );
  }

  for (const userId of [OWNER_ID, OTHER_ID]) {
    const namespace = `${userId}:memories`;
    const embedding = `[1,${Array.from({ length: 1_535 }, () => "0").join(",")}]`;
    await pool.query(
      `insert into store (namespace_path, key, value) values ($1, 'memory', '{"data":"fixture"}')`,
      [namespace],
    );
    await pool.query(
      `insert into store_vectors (namespace_path, key, field_path, text_content, embedding)
       values ($1, 'memory', '$', 'fixture', $2::vector)`,
      [namespace, embedding],
    );
  }
}

async function verifyHistoryAndSearch(pool: Pool): Promise<void> {
  const first = await listMessages({ threadId: OWNER_THREAD_ID, limit: 50 });
  assert.equal(first.items.length, 50);
  assert.equal(first.items[0]?.id, "phase-f-message-450");
  assert.equal(first.items.at(-1)?.id, "phase-f-message-499");
  assert.notEqual(first.nextCursor, null);

  const second = await listMessages({
    threadId: OWNER_THREAD_ID,
    limit: 50,
    cursor: first.nextCursor ?? undefined,
  });
  assert.equal(second.items[0]?.id, "phase-f-message-400");
  assert.equal(second.items.at(-1)?.id, "phase-f-message-449");

  const hits = await searchMessages({ userId: OWNER_ID, query: "phasefneedle", limit: 20 });
  assert.equal(hits.items.length, 10);
  assert.equal(
    hits.items.every((hit) => hit.thread.userId === OWNER_ID),
    true,
  );

  await pool.query("set enable_seqscan = off");
  const explained = await pool.query<PlanRow>(
    `explain (format text)
     select m.id from message m join thread t on t.id = m.thread_id
     where t.user_id = $1
       and m.search_vector @@ websearch_to_tsquery('simple', $2)`,
    [OWNER_ID, "phasefneedle"],
  );
  await pool.query("set enable_seqscan = on");
  const plan = explained.rows.map((row) => row["QUERY PLAN"]).join("\n");
  assert.match(plan, /message_search_vector_idx/);

  let after = null;
  let exported = 0;
  let pageCount = 0;
  do {
    const page = await listMessagesForExport({
      threadId: OWNER_THREAD_ID,
      after,
      limit: 50,
    });
    exported += page.items.length;
    after = page.next;
    pageCount += 1;
    assert.ok(pageCount <= 11, "export pagination must terminate");
  } while (after !== null);
  assert.equal(exported, 500);

  assert.equal(
    await completeToolCall({
      threadId: OTHER_THREAD_ID,
      toolCallId: "phase-f-call",
      output: { result: "fixture" },
      errorText: null,
    }),
    true,
  );
  const toolParts = await pool.query<{ parts: Array<{ state: string; output: object }> }>(
    "select parts from message where id = 'phase-f-tool-message'",
  );
  assert.deepEqual(toolParts.rows[0]?.parts[0], {
    type: "tool",
    toolCallId: "phase-f-call",
    toolName: "search",
    state: "output-available",
    input: { query: "fixture" },
    output: { result: "fixture" },
    errorText: null,
  });
}

async function verifyDeletion(pool: Pool): Promise<void> {
  await beginAccountDeletion(OWNER_ID);
  const admission = await acquireStreamLeaseForActiveAccount({
    userId: OWNER_ID,
    ownerKey: `chat:user:${OWNER_ID}`,
    slots: 1,
    leaseId: "phase-f-deleting-lease",
    ttlMs: 60_000,
  });
  assert.deepEqual(admission, { status: "account-deleting" });
  await deleteLocalAccountData(OWNER_ID);

  assert.equal(
    await count(pool, `select count(*)::int as count from "user" where id = $1`, OWNER_ID),
    0,
  );
  assert.equal(
    await count(pool, "select count(*)::int as count from thread where user_id = $1", OWNER_ID),
    0,
  );
  assert.equal(
    await count(
      pool,
      "select count(*)::int as count from message where thread_id = $1",
      OWNER_THREAD_ID,
    ),
    0,
  );
  for (const table of ["checkpoints", "checkpoint_blobs", "checkpoint_writes"]) {
    assert.equal(
      await count(
        pool,
        `select count(*)::int as count from ${table} where thread_id = $1`,
        OWNER_THREAD_ID,
      ),
      0,
    );
    assert.equal(
      await count(
        pool,
        `select count(*)::int as count from ${table} where thread_id = $1`,
        OTHER_THREAD_ID,
      ),
      1,
    );
  }
  assert.equal(
    await count(
      pool,
      "select count(*)::int as count from store where namespace_path = $1",
      `${OWNER_ID}:memories`,
    ),
    0,
  );
  assert.equal(
    await count(
      pool,
      "select count(*)::int as count from store_vectors where namespace_path = $1",
      `${OWNER_ID}:memories`,
    ),
    0,
  );
  assert.equal(
    await count(pool, `select count(*)::int as count from "user" where id = $1`, OTHER_ID),
    1,
  );
}

async function cleanup(pool: Pool): Promise<void> {
  await pool.query(`delete from "user" where id in ($1, $2)`, [OWNER_ID, OTHER_ID]);
  await pool.query("delete from account_deletion where user_id in ($1, $2)", [OWNER_ID, OTHER_ID]);
  await pool.query("delete from checkpoint_blobs where thread_id in ($1, $2)", [
    OWNER_THREAD_ID,
    OTHER_THREAD_ID,
  ]);
  await pool.query("delete from checkpoint_writes where thread_id in ($1, $2)", [
    OWNER_THREAD_ID,
    OTHER_THREAD_ID,
  ]);
  await pool.query("delete from checkpoints where thread_id in ($1, $2)", [
    OWNER_THREAD_ID,
    OTHER_THREAD_ID,
  ]);
  await pool.query("delete from store where namespace_path in ($1, $2)", [
    `${OWNER_ID}:memories`,
    `${OTHER_ID}:memories`,
  ]);
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    await cleanup(pool);
    await seed(pool);
    await verifyHistoryAndSearch(pool);
    await verifyDeletion(pool);
    console.log(
      "Phase F database verification passed: history, terminating export, tool results, GIN search, and account cascade.",
    );
  } finally {
    await cleanup(pool);
    await pool.end();
  }
}

void main();
