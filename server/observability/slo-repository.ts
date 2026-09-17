/**
 * The durable half of the SLO measurements.
 *
 * `chat_stream` already records one row per turn with its state and, since
 * Phase H, the moment its first token reached the client. That makes both chat
 * SLOs fleet-wide facts rather than per-process estimates — which is the
 * difference between a number you can report and a number you can only glance
 * at.
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";

const latencyRowSchema = z.object({
  latency_ms: z.coerce.number().nonnegative(),
});

/**
 * Time-to-first-token for every turn in the window that produced one.
 *
 * Returned as raw samples rather than a percentile computed in SQL, so the
 * percentile definition lives in one tested place (`lib/observability/slo.ts`)
 * and matches everywhere it is quoted. Capped, because the p95 of ten thousand
 * samples and of the most recent five thousand are the same number to anyone
 * reading a dashboard.
 *
 * Turns with no first token are absent by construction: `first_token_at` is
 * null for a turn that failed or was stopped before the model said anything,
 * and scoring those as latency zero would make an outage look fast.
 */
export async function listTimeToFirstTokenMs(params: {
  readonly since: Date;
  readonly limit: number;
}): Promise<number[]> {
  const result = await db.execute(sql`
    select
      extract(epoch from (first_token_at - created_at)) * 1000 as latency_ms
    from chat_stream
    where created_at >= ${params.since}::timestamptz
      and first_token_at is not null
    order by created_at desc
    limit ${params.limit}::int
  `);

  return result.rows.map((row) => latencyRowSchema.parse(row).latency_ms);
}

const streamOutcomeRowSchema = z.object({
  total: z.coerce.number().int().nonnegative(),
  failed: z.coerce.number().int().nonnegative(),
});

/**
 * Settled turns in the window, and how many of them failed.
 *
 * `aborted` counts toward the total but never toward failures: the user
 * stopped the answer and got exactly what they asked for. Counting stops as
 * errors would make the error rate a measure of how often people change their
 * mind. Still-streaming turns are excluded — they have no outcome yet.
 */
export async function readStreamOutcomes(params: {
  readonly since: Date;
}): Promise<{ total: number; failed: number }> {
  const result = await db.execute(sql`
    select
      count(*)::int as total,
      count(*) filter (where state = 'failed')::int as failed
    from chat_stream
    where created_at >= ${params.since}::timestamptz
      and state <> 'streaming'
  `);

  const row = result.rows[0];
  if (row === undefined) return { total: 0, failed: 0 };
  return streamOutcomeRowSchema.parse(row);
}
