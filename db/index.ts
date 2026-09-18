/**
 * Single database entry point.
 *
 * Two drivers, chosen from the connection string's host and nothing else:
 *
 *  - **Neon** (`*.neon.tech`) uses the serverless `Pool` (WebSocket) rather
 *    than the `neon()` HTTP driver, so the app has real transactions and
 *    matches the connection style the LangGraph checkpointer and store already
 *    use. This is what production runs on.
 *  - **Anything else** uses `pg` over plain TCP. Neon's `Pool` speaks only to
 *    Neon's WebSocket endpoint, so without this branch the `docker-compose.yaml`
 *    in this repository and the Postgres service container the integration
 *    tests run against would both be unreachable.
 *
 * Both produce the same Drizzle query builder over the same schema, and the
 * `pg` instance is assignable to the Neon one — structurally they differ only
 * in the driver-specific `$client` and result types, neither of which this app
 * names. So `Database` stays one type and no caller knows which driver it got.
 *
 * Every query in the app goes through this instance.
 */

import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { Pool as NodePool } from "pg";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { env } from "@/lib/env";
import {
  isNeonConnectionString,
  pgConnectionStringWithExplicitVerifyFull,
} from "@/lib/pg-connection-string";
import * as authSchema from "@/db/schema/auth-schema";
import * as chatSchema from "@/db/schema/chat-schema";
import * as billingSchema from "@/db/schema/billing-schema";
import * as limitsSchema from "@/db/schema/limits-schema";

export const schema = { ...authSchema, ...chatSchema, ...billingSchema, ...limitsSchema };

export type Database = NeonDatabase<typeof schema>;

type ClosablePool = { end: () => Promise<void> };

function connect(): { db: Database; pool: ClosablePool } {
  const connectionString = env.DATABASE_URL;

  if (isNeonConnectionString(connectionString)) {
    const pool = new NeonPool({ connectionString });
    return { db: drizzleNeon({ client: pool, schema }), pool };
  }

  const pool = new NodePool({
    connectionString: pgConnectionStringWithExplicitVerifyFull(connectionString),
  });

  return { db: drizzleNodePg({ client: pool, schema }), pool };
}

const connection = connect();

export const db = connection.db;

/**
 * Closes the pool.
 *
 * The server never calls this — the pool lives as long as the process. Scripts
 * and tests do: a short-lived process with an open pool does not exit, and a
 * test database cannot be dropped while something is still connected to it.
 */
export async function closeDatabase(): Promise<void> {
  await connection.pool.end();
}
