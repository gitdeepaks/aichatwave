import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
