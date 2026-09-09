/**
 * Drops and recreates the public schema, then re-applies migrations.
 *
 * Destructive by design and intended for development branches only. Refuses to
 * run against production and refuses to run without an explicit `--yes`.
 *
 * Usage: pnpm db:reset -- --yes
 */

import { Pool } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import { logger } from "@/server/lib/logger";

const log = logger.child({ script: "db-reset" });

function assertSafeToRun(): void {
  if (env.NODE_ENV === "production") {
    throw new Error("db:reset refuses to run with NODE_ENV=production.");
  }
  if (!process.argv.includes("--yes")) {
    throw new Error("db:reset is destructive. Re-run with --yes to confirm.");
  }
}

async function main(): Promise<void> {
  assertSafeToRun();

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    log.warn("db.reset_started", { host: new URL(env.DATABASE_URL).hostname });
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("CREATE SCHEMA public");
    log.info("db.reset_completed");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  log.error("script.failed", {}, error);
  process.exitCode = 1;
});
