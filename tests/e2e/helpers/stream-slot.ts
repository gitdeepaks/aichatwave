/**
 * The E2E identity's stream-slot hygiene.
 *
 * `PLAN_LIMITS.free.concurrentStreams` is **1**, and a turn deliberately
 * outlives the client that started it — that is what makes a refresh
 * resumable. Both are correct, and together they mean a suite of streaming
 * tests running back to back contends with itself: the previous test's turn
 * can still hold the account's only slot when the next one sends, and the
 * product answers `RATE_LIMITED`, which is the rate limiter working and the
 * suite failing anyway.
 *
 * So each streaming test starts by settling whatever this identity left open.
 * Because the suite is serial (`workers: 1`), anything still streaming at that
 * moment belongs to a test that has already made its assertions, or to a run
 * that was killed. Neither is worth waiting five minutes for.
 *
 * Only ever this identity's rows, and this identity is a username-only Clerk
 * user no human can sign in as.
 *
 * The statement is written here rather than called through
 * `server/db/chat-stream-repository.ts` because that module reaches the server
 * graph through the `@/` alias and Playwright's loader does not apply the
 * tsconfig path mapping to files outside `testDir`. The driver choice mirrors
 * `db/index.ts`: Neon's pool speaks only to Neon's WebSocket endpoint, and CI
 * runs a plain Postgres service container.
 */

import { Pool as NeonPool } from "@neondatabase/serverless";
import { Pool as NodePool } from "pg";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isNeonConnectionString } from "../../../lib/pg-connection-string";

/**
 * Where the setup project leaves the Clerk user id for the specs.
 *
 * Beside the storage state, in the same gitignored directory and for the same
 * reason: it is per-run state that belongs to whoever ran the suite, not to
 * the repository.
 */
const USER_ID_PATH = "tests/e2e/.auth/user-id.txt";

export function rememberTestUserId(userId: string): void {
  mkdirSync(dirname(USER_ID_PATH), { recursive: true });
  writeFileSync(USER_ID_PATH, userId, "utf8");
}

export function readTestUserId(): string | null {
  try {
    const id = readFileSync(USER_ID_PATH, "utf8").trim();
    return id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/** Settles every stream this identity currently holds open. */
export async function releaseLiveStreams(userId: string): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (connectionString === undefined || connectionString.length === 0) return;

  const pool = isNeonConnectionString(connectionString)
    ? new NeonPool({ connectionString })
    : new NodePool({ connectionString });

  try {
    // The slot itself. `stream_lease` is what `assertStreamSlot` counts, keyed
    // by `userBucketKey(userId)` — clearing `chat_stream` alone leaves the
    // lease behind and the next send is still refused.
    await pool.query(`delete from stream_lease where owner_key = $1`, [`chat:user:${userId}`]);

    // And the stream rows, so a killed run does not leave the resume endpoint
    // offering a turn that no process is generating.
    await pool.query(
      `update chat_stream
          set state = 'aborted', settled_at = now()
        where user_id = $1 and state = 'streaming'`,
      [userId],
    );
  } finally {
    // An open pool keeps the runner's process alive after the last test.
    await pool.end();
  }
}

/** Convenience for a spec's `beforeEach`; a no-op when setup did not run. */
export async function releaseSlotForTests(): Promise<void> {
  const userId = readTestUserId();
  if (userId === null) return;
  await releaseLiveStreams(userId);
}
