/**
 * Abuse-control state: rate-limit counters and stream leases.
 *
 * Deliberately not domain data, and deliberately without a foreign key to
 * `user`. These rows are keyed by whatever the limiter is counting — a user
 * id, but also a client IP that belongs to nobody — and they are swept on a
 * clock rather than owned by a row. A cascade from `user` would delete a
 * counter the moment an abusive account was removed, which is precisely when
 * the counter is still wanted.
 *
 * Postgres rather than Redis because this deploys to one region: a table with
 * a composite primary key is one round trip on a connection the request
 * already holds, and it removes a second piece of infrastructure that can be
 * down. See `docs/pro_plan.md` Phase D for the multi-region note.
 */

import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * One row per (key, window). Written by the sliding-window counter in
 * `server/db/rate-limit-repository.ts` and swept once its window is long past.
 */
export const rateLimitBucket = pgTable(
  "rate_limit_bucket",
  {
    /** Scope and subject, e.g. `chat:user:user_2ab…` or `chat:ip:203.0.113.7`. */
    bucketKey: text("bucket_key").notNull(),
    /** Epoch-aligned start of the window, so every replica agrees on it. */
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    hits: integer("hits").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.bucketKey, table.windowStart] }),
    // The sweep's only query: delete everything older than a cutoff, across
    // all keys. Without this it is a sequential scan of the whole table.
    index("rate_limit_bucket_window_start_idx").on(table.windowStart),
  ],
);

/**
 * A held slot in a user's concurrent-stream allowance.
 *
 * The primary key is `(owner_key, slot)`, which is what makes acquisition
 * atomic: claiming a slot is an insert that either wins or conflicts, so two
 * simultaneous requests cannot both believe they hold the same one.
 *
 * `expires_at` is a backstop, not the mechanism — leases are released when the
 * response stream settles. It bounds the damage when a process dies mid-stream
 * and never gets to release.
 */
export const streamLease = pgTable(
  "stream_lease",
  {
    /** Subject of the cap, e.g. `chat:user:user_2ab…`. */
    ownerKey: text("owner_key").notNull(),
    /** Zero-based slot index, below the plan's `concurrentStreams`. */
    slot: integer("slot").notNull(),
    /** Identifies the holder, so a release cannot free someone else's slot. */
    leaseId: text("lease_id").notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerKey, table.slot] }),
    index("stream_lease_expires_at_idx").on(table.expiresAt),
  ],
);
