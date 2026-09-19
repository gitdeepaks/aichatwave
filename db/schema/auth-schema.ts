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

import { boolean, index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Whether a user has agreed to long-term memory.
 *
 * A two-value enum with a nullable column rather than a boolean, because
 * there are three states and only one of them is a decision the user made.
 * `null` is "never asked", and it is the state a new account starts in —
 * a boolean would have to default to something, and both defaults are a lie:
 * `false` hides the feature from someone who would want it, `true` turns on
 * durable storage of personal facts without asking. The onboarding dialog
 * exists to move a row out of `null`, and `memoryConsentAt` records when.
 */
export const memoryConsentEnum = pgEnum("memory_consent", ["granted", "declined"]);

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
    /**
     * Whether the assistant may store durable facts about this user.
     *
     * Null until asked. Enforced in `server/memory/memory-consent-service.ts`
     * and read on the chat path *before* extraction is scheduled, so declining
     * stops the write rather than hiding what was written.
     */
    memoryConsent: memoryConsentEnum("memory_consent"),
    /** When the decision above was last recorded. Null exactly when it is. */
    memoryConsentAt: timestamp("memory_consent_at", { withTimezone: true }),
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

/**
 * Permanent deletion marker, intentionally independent of `user` cascades.
 * Its presence blocks identity reprovisioning and new user-owned writes even
 * after the local and Clerk identity rows are gone.
 */
export const accountDeletion = pgTable("account_deletion", {
  userId: text("user_id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  localDeletedAt: timestamp("local_deleted_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const schema = { accountDeletion, user };
