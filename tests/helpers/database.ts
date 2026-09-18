/**
 * An ephemeral Postgres database for one test file.
 *
 * It is built from this repository's own `drizzle/*.sql` migrations, not from
 * a hand-written fixture — so a migration that is wrong fails here rather than
 * on deploy, and the generated `search_vector` column, the enums, the indexes
 * and the foreign keys are all the real ones.
 *
 * Scope is one database per process, which `node --test` makes one per file, so
 * two files can run at once without seeing each other's rows and a crashed run
 * leaves at most one stray database behind.
 *
 * When no Postgres is reachable the whole file skips with a reason rather than
 * failing, so `pnpm test` stays runnable on a laptop with nothing running.
 * `TEST_REQUIRE_DATABASE=1` turns that skip into a failure, which is what
 * `pnpm test:integration` sets — a suite that silently skipped itself in CI
 * would be worse than no suite at all.
 */

import { after, before, test, type TestContext } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import {
  adminDatabaseUrl,
  clearCapturedLogs,
  testDatabaseName,
  testDatabaseUrl,
} from "./environment";
import { isModuleLoaded } from "./module-stub";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const migrationsDir = path.join(repoRoot, "drizzle");

/** Drizzle separates statements within a file with this marker. */
const STATEMENT_SEPARATOR = "--> statement-breakpoint";

type Readiness = { ready: true } | { ready: false; reason: string };

let readiness: Readiness = { ready: false, reason: "database setup has not run" };

/** Tables the harness truncates between tests, discovered rather than listed. */
let managedTables: string[] = [];

/** A connection to the server, outside the test database, for creating and dropping it. */
async function withAdminClient<TResult>(
  run: (client: Client) => Promise<TResult>,
): Promise<TResult> {
  return withClient(adminDatabaseUrl, run);
}

/**
 * A connection to the test database.
 *
 * Exported so a test can arrange state or assert on rows the app does not
 * expose — the generated search vector, a rate-limit bucket, a stream lease.
 */
export async function withTestClient<TResult>(
  run: (client: Client) => Promise<TResult>,
): Promise<TResult> {
  return withClient(testDatabaseUrl, run);
}

async function withClient<TResult>(
  connectionString: string,
  run: (client: Client) => Promise<TResult>,
): Promise<TResult> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function applyMigrations(client: Client): Promise<void> {
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDir, file), "utf8");

    for (const statement of sql.split(STATEMENT_SEPARATOR)) {
      const trimmed = statement.trim();
      if (trimmed.length === 0) continue;
      await client.query(trimmed);
    }
  }
}

/**
 * Creates and migrates the throwaway database, or records why it could not.
 *
 * A connection failure is the expected outcome on a machine with no Postgres,
 * so it becomes a skip reason. Anything after a successful connection — a
 * migration that does not apply, say — is a real failure and is rethrown.
 */
async function createTestDatabase(): Promise<void> {
  try {
    await withAdminClient((admin) => admin.query(`create database "${testDatabaseName}"`));
  } catch (error) {
    readiness = {
      ready: false,
      reason:
        `no Postgres at ${redact(adminDatabaseUrl)} (${describeError(error)}). ` +
        "Start one with `docker compose up -d db`, or set TEST_DATABASE_URL.",
    };
    return;
  }

  await withTestClient(applyMigrations);
  await setupCheckpointer();

  await withTestClient(async (client) => {
    const tables = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    managedTables = tables.rows.map((row) => row.tablename);
  });

  readiness = { ready: true };
}

/**
 * The LangGraph checkpoint tables.
 *
 * `pnpm migration:migrate` creates these alongside the Drizzle migrations (see
 * `scripts/db-setup-langgraph.ts`), and they are not optional furniture:
 * `deleteThread` deletes a thread's checkpoints in the same transaction as the
 * thread itself, so a database without them cannot serve a delete at all.
 *
 * The memory vector store is deliberately not set up here — it needs pgvector
 * and an embedder. `tests/helpers/memory-store.ts` does that, for the files
 * that need it.
 */
async function setupCheckpointer(): Promise<void> {
  const checkpointer = PostgresSaver.fromConnString(testDatabaseUrl);
  try {
    await checkpointer.setup();
  } finally {
    await checkpointer.end();
  }
}

async function teardownDatabase(): Promise<void> {
  if (!readiness.ready) return;

  // The app's pool holds open connections; closing it is what lets the test
  // process exit, and what lets Postgres drop the database.
  await closeAppPool();

  await withAdminClient(async (admin) => {
    await admin.query(
      `select pg_terminate_backend(pid) from pg_stat_activity
       where datname = $1 and pid <> pg_backend_pid()`,
      [testDatabaseName],
    );
    await admin.query(`drop database if exists "${testDatabaseName}"`);
  });
}

/** Ends the pool `@/db` opened, if this file ever loaded it. */
async function closeAppPool(): Promise<void> {
  if (!isModuleLoaded("@/db")) return;

  const { closeDatabase } = await import("@/db");
  await closeDatabase();
}

/** Empties every table, leaving the schema in place. */
async function resetDatabase(): Promise<void> {
  if (!readiness.ready || managedTables.length === 0) return;

  const quoted = managedTables.map((name) => `"${name}"`).join(", ");
  await withTestClient(async (client) => {
    await client.query(`truncate table ${quoted} restart identity cascade`);
  });
}

/** Whether a missing database is a failure rather than a skip. Set by CI. */
function databaseIsRequired(): boolean {
  return process.env["TEST_REQUIRE_DATABASE"] === "1";
}

function isDatabaseReady(): boolean {
  return readiness.ready;
}

function databaseSkipReason(): string {
  return readiness.ready ? "" : readiness.reason;
}

type TestDatabaseOptions = {
  /**
   * Also create the LangGraph vector store and point `@/server/memory/store`
   * at it. Off by default: it needs pgvector, and only the memory surfaces
   * touch it.
   */
  memoryStore?: boolean;
};

/**
 * Registers the per-file database lifecycle. Call once, at the top level of a
 * test file, before any `dbTest`.
 *
 * Optional setup is an argument rather than a second `before` hook in the test
 * file, because sibling root hooks are not ordered against each other — a
 * memory-store setup registered separately ran *before* the database existed,
 * silently fell through its readiness check, and left the tests talking to the
 * real OpenAI embedding endpoint.
 */
export function setupTestDatabase(options: TestDatabaseOptions = {}): void {
  before(async () => {
    await createTestDatabase();
    if (!readiness.ready) return;

    if (options.memoryStore === true) {
      const { setupMemoryStore } = await import("./memory-store");
      await setupMemoryStore();
    }
  });

  after(async () => {
    const { teardownMemoryStore } = await import("./memory-store");
    await teardownMemoryStore();
    await teardownDatabase();
  });
}

/**
 * A test that needs the database: skipped with a reason when there is none,
 * and always handed an empty one, along with an empty log buffer so
 * `findLogLine` cannot match a line an earlier test emitted.
 *
 * Truncating before rather than after is deliberate — a failed test leaves its
 * rows in place to be looked at.
 */
export function dbTest(name: string, fn: (t: TestContext) => Promise<void>): void {
  test(name, async (t) => {
    if (!isDatabaseReady()) {
      if (databaseIsRequired()) {
        throw new Error(
          `This test needs a database and TEST_REQUIRE_DATABASE is set: ${databaseSkipReason()}`,
        );
      }
      t.skip(databaseSkipReason());
      return;
    }

    await resetDatabase();
    clearCapturedLogs();
    await fn(t);
  });
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redact(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    url.password = "";
    url.username = "";
    return url.toString();
  } catch {
    return "the configured TEST_DATABASE_URL";
  }
}
