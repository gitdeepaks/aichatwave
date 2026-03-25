import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user as schema } from "./auth-schema";

export const thread = pgTable("thread", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => schema.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at"),
});
// todo: add (table) => [index(...)] for userId when optimizing queries
