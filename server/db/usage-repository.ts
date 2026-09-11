/**
 * The only module that reads or writes `usage_counter`.
 *
 * The reservation is a conditional upsert rather than a read followed by a
 * write. A read-then-write quota check is the classic way an allowance gets
 * overrun: two requests both read 149 of 150 and both proceed. Here the limit
 * is a predicate on the `do update`, so the row either moves or it does not,
 * and "did I get a slot?" is answered by whether a row came back.
 */

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { usageCounter } from "@/db/schema/billing-schema";

export type UsageRecord = {
  messages: number;
  inputTokens: number;
  outputTokens: number;
};

const EMPTY_USAGE: UsageRecord = { messages: 0, inputTokens: 0, outputTokens: 0 };

const reservationRowSchema = z.object({
  messages: z.coerce.number().int().nonnegative(),
});

/**
 * Takes one message off the user's monthly allowance, or reports that there is
 * none left.
 *
 * Returns the post-reservation count on success and the current count on
 * refusal, so the caller can tell the user how much they have used without a
 * second query.
 */
export async function reserveMessage(params: {
  userId: string;
  periodStart: Date;
  limit: number;
}): Promise<{ reserved: boolean; messages: number }> {
  const { userId, periodStart, limit } = params;

  if (limit <= 0) {
    const current = await readUsage({ userId, periodStart });
    return { reserved: false, messages: current.messages };
  }

  const result = await db.execute(sql`
    insert into usage_counter (user_id, period_start, messages)
    values (${userId}::text, ${periodStart}::timestamptz, 1)
    on conflict (user_id, period_start) do update
      set messages = usage_counter.messages + 1,
          updated_at = now()
      where usage_counter.messages < ${limit}::int
    returning messages
  `);

  const row = result.rows[0];
  if (row !== undefined) {
    return { reserved: true, messages: reservationRowSchema.parse(row).messages };
  }

  // No row came back: the `do update` predicate was false, so the allowance is
  // spent. Read it back for the message shown to the user.
  const current = await readUsage({ userId, periodStart });
  return { reserved: false, messages: current.messages };
}

/**
 * Gives a reserved message back.
 *
 * Used when the turn fails before any provider money is spent. The floor at
 * zero matters: a period rollover between reservation and release would
 * otherwise drive a fresh period negative and hand out free allowance.
 */
export async function releaseMessage(params: { userId: string; periodStart: Date }): Promise<void> {
  await db
    .update(usageCounter)
    .set({ messages: sql`greatest(0, ${usageCounter.messages} - 1)`, updatedAt: new Date() })
    .where(
      and(eq(usageCounter.userId, params.userId), eq(usageCounter.periodStart, params.periodStart)),
    );
}

/** Adds provider-reported tokens to the period. Never gates anything; recorded for reconciliation. */
export async function recordTokens(params: {
  userId: string;
  periodStart: Date;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  const inputTokens = Math.max(0, Math.trunc(params.inputTokens));
  const outputTokens = Math.max(0, Math.trunc(params.outputTokens));
  if (inputTokens === 0 && outputTokens === 0) return;

  await db
    .insert(usageCounter)
    .values({
      userId: params.userId,
      periodStart: params.periodStart,
      messages: 0,
      inputTokens,
      outputTokens,
    })
    .onConflictDoUpdate({
      target: [usageCounter.userId, usageCounter.periodStart],
      set: {
        inputTokens: sql`${usageCounter.inputTokens} + ${inputTokens}`,
        outputTokens: sql`${usageCounter.outputTokens} + ${outputTokens}`,
        updatedAt: new Date(),
      },
    });
}

export async function readUsage(params: {
  userId: string;
  periodStart: Date;
}): Promise<UsageRecord> {
  const rows = await db
    .select({
      messages: usageCounter.messages,
      inputTokens: usageCounter.inputTokens,
      outputTokens: usageCounter.outputTokens,
    })
    .from(usageCounter)
    .where(
      and(eq(usageCounter.userId, params.userId), eq(usageCounter.periodStart, params.periodStart)),
    )
    .limit(1);

  return rows[0] ?? EMPTY_USAGE;
}
