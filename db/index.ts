/**
 * Single database entry point.
 *
 * Uses the Neon serverless `Pool` (WebSocket) rather than the `neon()` HTTP
 * driver so the app has real transactions and matches the connection style the
 * LangGraph checkpointer and store already use. Every query in the app goes
 * through this instance.
 */

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { env } from "@/lib/env";
import * as authSchema from "@/db/schema/auth-schema";
import * as chatSchema from "@/db/schema/chat-schema";
import * as billingSchema from "@/db/schema/billing-schema";
import * as limitsSchema from "@/db/schema/limits-schema";

export const schema = { ...authSchema, ...chatSchema, ...billingSchema, ...limitsSchema };

const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle({ client: pool, schema });

export type Database = typeof db;
