/**
 * The only module that writes rate-limit counters and stream leases.
 *
 * Both operations are single statements. That is the point: a limiter that
 * reads, decides in the application, and then writes has a window in which two
 * requests both see room, and under a burst — the exact condition a limiter
 * exists for — that window is always open.
 *
 * Every result is parsed through a Zod schema before it leaves this module.
 * Drizzle's `db.execute` returns untyped rows, so this is the boundary where
 * that stops, in the same way `server/db/thread-repository.ts` returns domain
 * records rather than Drizzle rows.
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  previousWindowWeight,
  retryAfterSeconds,
  windowBounds,
  type WindowCounts,
} from "@/lib/security/sliding-window";

export type ConsumeWindowParams = {
  bucketKey: string;
  limit: number;
  windowMs: number;
  now: Date;
};

export type WindowDecision = {
  allowed: boolean;
  /** Weighted count at the moment of the decision, for logging. */
  weightedHits: number;
  limit: number;
  /** Present only when the request was rejected. */
  retryAfterSeconds: number | null;
};

const windowRowSchema = z.object({
  allowed: z.boolean(),
  current_hits: z.coerce.number().int().nonnegative(),
  previous_hits: z.coerce.number().int().nonnegative(),
  weighted: z.coerce.number().nonnegative(),
});

/**
 * Applies one sliding-window counter and, when there is room, records the hit.
 *
 * The `applied` CTE is a data-modifying CTE guarded by the decision, so the
 * counter is incremented only for requests that were allowed — a rejected
 * caller does not dig its own hole deeper, which is what makes `Retry-After`
 * honest. Postgres runs a data-modifying CTE to completion whether or not the
 * outer query reads it, so nothing is lost by the final SELECT ignoring it.
 *
 * Known and accepted: both CTEs see the same snapshot, so N requests arriving
 * inside the same instant can each see room and overshoot the limit by up to
 * N-1. The concurrent-stream lease caps N per user at the plan's
 * `concurrentStreams`, so the overshoot is bounded by a small constant rather
 * than by how fast an attacker can send. Exact atomicity here would need a
 * lock per key, which costs more than the overshoot is worth.
 */
export async function consumeWindow(params: ConsumeWindowParams): Promise<WindowDecision> {
  const { bucketKey, limit, windowMs, now } = params;

  if (limit <= 0) {
    return {
      allowed: false,
      weightedHits: 0,
      limit,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  const bounds = windowBounds(now, windowMs);
  const weight = previousWindowWeight(bounds.elapsedMs, windowMs);

  const result = await db.execute(sql`
    with bounds as (
      select
        ${bucketKey}::text as bucket_key,
        ${bounds.currentStart}::timestamptz as current_start,
        ${bounds.previousStart}::timestamptz as previous_start,
        ${limit}::int as max_hits,
        ${weight}::double precision as previous_weight
    ),
    counts as (
      select
        bounds.bucket_key,
        bounds.current_start,
        bounds.max_hits,
        coalesce(
          max(bucket.hits) filter (where bucket.window_start = bounds.current_start), 0
        )::int as current_hits,
        coalesce(
          max(bucket.hits) filter (where bucket.window_start = bounds.previous_start), 0
        )::int as previous_hits,
        coalesce(
          max(bucket.hits) filter (where bucket.window_start = bounds.previous_start), 0
        )::double precision * bounds.previous_weight
          + coalesce(
              max(bucket.hits) filter (where bucket.window_start = bounds.current_start), 0
            )::double precision as weighted
      from bounds
      left join rate_limit_bucket as bucket
        on bucket.bucket_key = bounds.bucket_key
       and bucket.window_start in (bounds.current_start, bounds.previous_start)
      group by bounds.bucket_key, bounds.current_start, bounds.max_hits, bounds.previous_weight
    ),
    decision as (
      select
        counts.bucket_key,
        counts.current_start,
        counts.current_hits,
        counts.previous_hits,
        counts.weighted,
        counts.weighted < counts.max_hits as allowed
      from counts
    ),
    applied as (
      insert into rate_limit_bucket (bucket_key, window_start, hits)
      select decision.bucket_key, decision.current_start, 1
      from decision
      where decision.allowed
      on conflict (bucket_key, window_start)
        do update set hits = rate_limit_bucket.hits + 1
      returning hits
    )
    select decision.allowed, decision.current_hits, decision.previous_hits, decision.weighted
    from decision
  `);

  const row = windowRowSchema.parse(result.rows[0]);
  const counts: WindowCounts = {
    currentHits: row.current_hits,
    previousHits: row.previous_hits,
  };

  if (row.allowed) {
    return { allowed: true, weightedHits: row.weighted, limit, retryAfterSeconds: null };
  }

  return {
    allowed: false,
    weightedHits: row.weighted,
    limit,
    retryAfterSeconds: retryAfterSeconds({
      counts,
      limit,
      windowMs,
      elapsedMs: bounds.elapsedMs,
    }),
  };
}

/** Drops counters whose window is long gone. Called opportunistically, off the response path. */
export async function sweepRateLimitBuckets(olderThan: Date): Promise<void> {
  await db.execute(sql`
    delete from rate_limit_bucket where window_start < ${olderThan}::timestamptz
  `);
}

export type StreamLease = {
  ownerKey: string;
  slot: number;
  leaseId: string;
  expiresAt: Date;
};

const leaseRowSchema = z.object({
  slot: z.coerce.number().int().nonnegative(),
  expires_at: z.coerce.date(),
});

const busyRowSchema = z.object({
  next_free_at: z.coerce.date().nullable(),
});

/**
 * Claims the lowest free slot in `ownerKey`'s allowance, or returns null when
 * every slot is held.
 *
 * Written as one insert over `generate_series` so the free-slot search and the
 * claim are the same statement. `where not exists` skips slots that are
 * currently held; the `on conflict … where expires_at <= now()` arm is what
 * takes over a slot whose holder died. If a concurrent request wins the same
 * slot first, the conflict arm's predicate is false and no row comes back,
 * which is the correct answer rather than a race.
 */
export async function acquireStreamLease(params: {
  ownerKey: string;
  slots: number;
  leaseId: string;
  ttlMs: number;
}): Promise<StreamLease | null> {
  const { ownerKey, slots, leaseId, ttlMs } = params;
  if (slots <= 0) return null;

  const result = await db.execute(sql`
    insert into stream_lease (owner_key, slot, lease_id, acquired_at, expires_at)
    select
      ${ownerKey}::text,
      candidate.slot,
      ${leaseId}::text,
      now(),
      now() + make_interval(secs => ${ttlMs / 1000}::double precision)
    from generate_series(0, ${slots}::int - 1) as candidate(slot)
    where not exists (
      select 1
      from stream_lease as held
      where held.owner_key = ${ownerKey}::text
        and held.slot = candidate.slot
        and held.expires_at > now()
    )
    order by candidate.slot
    limit 1
    on conflict (owner_key, slot) do update
      set lease_id = excluded.lease_id,
          acquired_at = excluded.acquired_at,
          expires_at = excluded.expires_at
      where stream_lease.expires_at <= now()
    returning slot, expires_at
  `);

  const row = result.rows[0];
  if (row === undefined) return null;

  const parsed = leaseRowSchema.parse(row);
  return { ownerKey, slot: parsed.slot, leaseId, expiresAt: parsed.expires_at };
}

/** When the earliest currently-held slot frees up; null when none are held. */
export async function nextStreamSlotFreeAt(ownerKey: string): Promise<Date | null> {
  const result = await db.execute(sql`
    select min(expires_at) as next_free_at
    from stream_lease
    where owner_key = ${ownerKey}::text and expires_at > now()
  `);

  return busyRowSchema.parse(result.rows[0] ?? { next_free_at: null }).next_free_at;
}

/**
 * Frees a slot. Matched on `lease_id` as well as the slot so a lease that has
 * already expired and been taken over by another request is not released out
 * from under its new holder.
 */
export async function releaseStreamLease(lease: StreamLease): Promise<void> {
  await db.execute(sql`
    delete from stream_lease
    where owner_key = ${lease.ownerKey}::text
      and slot = ${lease.slot}::int
      and lease_id = ${lease.leaseId}::text
  `);
}
