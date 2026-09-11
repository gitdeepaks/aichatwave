/**
 * Local mirror of Clerk identities.
 *
 * Clerk owns authentication, so the `session`, `account`, and `verification`
 * tables that Better Auth required are gone — Clerk holds sessions and OAuth
 * connections. What remains is a single `user` row per Clerk user, kept in step
 * by `server/auth/user-service.ts` (just-in-time on write) and the Clerk webhook
 * at `app/api/webhooks/clerk/route.ts`.
 *
 * `user.id` is the Clerk user id verbatim, so `thread.user_id` and
 * `subscription.user_id` continue to reference it directly.
 */

import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable(
  "user",
  {
    /** The Clerk user id (`user_...`). Not generated locally. */
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    /**
     * When this user's Polar subscription state was last pulled from Polar
     * itself, as opposed to received on a webhook.
     *
     * Null means the local `subscription` mirror has never been proven correct
     * for this user, and "no active subscription row" cannot yet be read as
     * "no subscription" — it may simply be a webhook that has not arrived. The
     * plan resolver treats null as a cold cache and consults Polar once; every
     * request after that is served locally. See
     * `server/billing/subscription-service.ts`.
     */
    billingSyncedAt: timestamp("billing_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  // Not unique: Clerk is the authority on email uniqueness, and enforcing it
  // here would make a legitimate email change in Clerk fail to sync.
  (table) => [index("user_email_idx").on(table.email)],
);

export const schema = { user };
