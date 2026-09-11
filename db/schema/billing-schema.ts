import { relations } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

/** Mirrors Polar's subscription status values. */
export const SUBSCRIPTION_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
] as const;

export const subscriptionStatus = pgEnum("subscription_status", SUBSCRIPTION_STATUSES);

/**
 * Local mirror of Polar subscription state, kept current by the Polar webhook
 * handler. Reading a plan from here removes the per-message Polar API call from
 * the chat hot path; the Polar API stays the source of truth and is consulted
 * only as a cold-cache fallback.
 */
export const subscription = pgTable(
  "subscription",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    polarSubscriptionId: text("polar_subscription_id").notNull(),
    polarProductId: text("polar_product_id").notNull(),
    status: subscriptionStatus("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: timestamp("cancel_at_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("subscription_polar_subscription_id_key").on(table.polarSubscriptionId),
    index("subscription_user_id_status_idx").on(table.userId, table.status),
  ],
);

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  user: one(user, { fields: [subscription.userId], references: [user.id] }),
}));

/**
 * Metered usage for one user in one billing period.
 *
 * This is the table `assertWithinQuota` reads, and it is local on purpose.
 * Usage has always been ingested to Polar and Polar's meter has always been
 * the billing record, but a meter read is a vendor round trip on the hot path
 * and fails closed the way every other vendor call does. A counter row is one
 * indexed upsert, and the reservation it performs is atomic — a user cannot
 * pipeline requests past their allowance while a check is in flight.
 *
 * `messages` is what the plan limit is expressed in; the token columns are
 * recorded for observability and for reconciling against Polar, not enforced.
 */
export const usageCounter = pgTable(
  "usage_counter",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Midnight UTC on the first of the period's month. */
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    /** Chat turns started. Incremented by the pre-flight reservation. */
    messages: integer("messages").notNull().default(0),
    /**
     * Token totals, as the providers reported them. `bigint` because a busy
     * Pro month clears `integer` — 2.1 billion tokens is large but not absurd
     * once a long context is resent on every turn.
     */
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.periodStart] })],
);

export const usageCounterRelations = relations(usageCounter, ({ one }) => ({
  user: one(user, { fields: [usageCounter.userId], references: [user.id] }),
}));
