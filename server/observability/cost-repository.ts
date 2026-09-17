/**
 * The only module that reads token usage for reporting.
 *
 * Phase A persists `model_id`, `input_tokens` and `output_tokens` on every
 * assistant message, so spend is already recorded per message — it has simply
 * never been read. One grouped query answers all three questions the dashboard
 * asks (per day, per model, per user), because the alternative is three scans
 * of the same table producing three views of the same numbers that can
 * disagree.
 *
 * Money is deliberately **not** computed in SQL. List prices live in
 * `MODEL_REGISTRY`, adding a model is a compile error until its price is
 * stated, and a second copy of that table inside a query is a copy that goes
 * stale silently. The database returns tokens; `cost-service.ts` prices them.
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";

/** One (day, user, model) cell. The finest grain every view is rolled up from. */
export type UsageBucket = {
  /** `YYYY-MM-DD`, UTC. A string because it is a bucket label, not an instant. */
  readonly day: string;
  readonly userId: string;
  /** Raw column value: a model retired from the registry still has rows. */
  readonly modelId: string;
  readonly messages: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
};

/**
 * `sum()` over `integer` returns `bigint`, which the driver hands back as a
 * string to avoid losing precision. Coerced rather than trusted, like every
 * other value crossing into this codebase from outside it.
 */
const usageBucketRowSchema = z.object({
  day: z.string().min(1),
  user_id: z.string().min(1),
  model_id: z.string().min(1),
  messages: z.coerce.number().int().nonnegative(),
  input_tokens: z.coerce.number().nonnegative(),
  output_tokens: z.coerce.number().nonnegative(),
});

export async function listUsageBuckets(params: {
  readonly since: Date;
  /** Hard ceiling on rows, so a pathological window cannot pull the table into memory. */
  readonly limit: number;
}): Promise<UsageBucket[]> {
  const result = await db.execute(sql`
    select
      to_char(date_trunc('day', m.created_at at time zone 'UTC'), 'YYYY-MM-DD') as day,
      t.user_id as user_id,
      m.model_id as model_id,
      count(*)::int as messages,
      coalesce(sum(m.input_tokens), 0) as input_tokens,
      coalesce(sum(m.output_tokens), 0) as output_tokens
    from message m
    join thread t on t.id = m.thread_id
    where m.created_at >= ${params.since}::timestamptz
      and m.model_id is not null
    group by 1, 2, 3
    order by 1 desc, 6 desc
    limit ${params.limit}::int
  `);

  return result.rows.map((row) => {
    const parsed = usageBucketRowSchema.parse(row);
    return {
      day: parsed.day,
      userId: parsed.user_id,
      modelId: parsed.model_id,
      messages: parsed.messages,
      inputTokens: parsed.input_tokens,
      outputTokens: parsed.output_tokens,
    };
  });
}
