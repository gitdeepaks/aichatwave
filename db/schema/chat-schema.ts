import { relations, sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { MESSAGE_ROLES, type MessageParts } from "@/lib/ai/message-parts";
import { user } from "./auth-schema";

export const messageRole = pgEnum("message_role", MESSAGE_ROLES);

export const thread = pgTable(
  "thread",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    /** Set on every persisted turn; drives the sidebar's ordering. */
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
  },
  (table) => [
    // The sidebar's default query. Partial on `archived_at is null` and ordered
    // to match the keyset tuple exactly, so Postgres walks the index and stops
    // at LIMIT instead of reading every one of the user's threads and sorting.
    // Measured on 20k rows: 0.099ms and 30 rows read, against 0.263ms and 171
    // rows read for the same index without the partial predicate.
    index("thread_active_user_updated_idx")
      .on(table.userId, table.updatedAt.desc(), table.id.desc())
      .where(sql`${table.archivedAt} is null`),
    // Serves the archived listing, which the partial index above excludes.
    index("thread_user_id_updated_at_id_idx").on(
      table.userId,
      table.updatedAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => thread.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    /**
     * Validated by `messagePartsSchema` on every read and write in
     * `server/db/message-repository.ts`. The `$type` annotation describes the
     * column to Drizzle; the repository is what enforces it at runtime.
     */
    parts: jsonb("parts").$type<MessageParts>().notNull(),
    /** Null for user messages, which are not produced by a model. */
    modelId: text("model_id"),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // Matches the keyset tuple (`order by created_at asc, id asc`) for the same
  // reason as the thread index above.
  (table) => [
    index("message_thread_id_created_at_id_idx").on(table.threadId, table.createdAt, table.id),
  ],
);

export const threadRelations = relations(thread, ({ one, many }) => ({
  user: one(user, { fields: [thread.userId], references: [user.id] }),
  messages: many(message),
}));

export const messageRelations = relations(message, ({ one }) => ({
  thread: one(thread, { fields: [message.threadId], references: [thread.id] }),
}));
