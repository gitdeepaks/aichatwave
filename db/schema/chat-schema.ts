import { relations, sql } from "drizzle-orm";
import {
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { MESSAGE_ROLES, type MessageParts } from "@/lib/ai/message-parts";
import { CHAT_STREAM_STATES } from "@/lib/chat/stream-state";
import { user } from "./auth-schema";

export const messageRole = pgEnum("message_role", MESSAGE_ROLES);
export const chatStreamState = pgEnum("chat_stream_state", CHAT_STREAM_STATES);

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

/**
 * Raw bytes. Drizzle has no first-class `bytea`, and the Neon driver hands the
 * column back as a `Buffer`, so both directions are named here rather than
 * asserted at each call site.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

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
    searchVector: tsvector("search_vector")
      .generatedAlwaysAs(
        sql`to_tsvector('simple', coalesce(jsonb_path_query_array("parts", '$[*] ? (@.type == "text").text') #>> '{}', ''))`,
      )
      .notNull(),
  },
  // Postgres can scan this index backward for the history/search keyset tuple
  // (`order by created_at desc, id desc`).
  (table) => [
    index("message_thread_id_created_at_id_idx").on(table.threadId, table.createdAt, table.id),
    index("message_search_vector_idx").using("gin", table.searchVector),
  ],
);

export const threadRelations = relations(thread, ({ one, many }) => ({
  user: one(user, { fields: [thread.userId], references: [user.id] }),
  messages: many(message),
}));

export const messageRelations = relations(message, ({ one }) => ({
  thread: one(thread, { fields: [message.threadId], references: [thread.id] }),
}));

/**
 * One row per assistant turn that is being streamed, and the record that makes
 * a stream resumable.
 *
 * A chat stream outlives the request that started it: the handler returns as
 * soon as the `Response` is constructed, and the body keeps producing for
 * however long the model takes. Nothing in the request/response cycle survives
 * a page reload, so a refresh mid-answer used to lose the answer permanently —
 * the tokens were already spent and the text was gone. This row, plus the
 * chunk log below, is what the reconnect endpoint replays.
 *
 * It is also the durable record of the turn's *input*. The user's message is
 * no longer written before the model runs (Phase G item 3 commits both halves
 * of a turn in one transaction when the stream settles), so `user_text` is
 * what a turn that died between start and settle can be recovered from.
 */
export const chatStream = pgTable(
  "chat_stream",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => thread.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    state: chatStreamState("state").notNull().default("streaming"),
    /** The model the turn was started with; also what the reconnecting client attributes. */
    modelId: text("model_id").notNull(),
    /** The user message this turn answers, held until the turn is committed. */
    userText: text("user_text").notNull(),
    /** Attachment ids carried by the user message, in order. */
    attachmentIds: jsonb("attachment_ids").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    /** Bumped on every flush, so a stalled stream is distinguishable from a slow one. */
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).defaultNow().notNull(),
    /**
     * When the first visible token reached the client.
     *
     * Persisted rather than counted in memory because time-to-first-token is
     * an SLO, and an SLO computed per process is a different number on every
     * instance and resets on every cold start. `first_token_at - created_at`
     * is the figure `server/observability/slo-service.ts` takes a p95 of, and
     * it is correct across the whole fleet because the row is shared.
     *
     * Null for a turn that never produced a token — it failed, or the user
     * stopped it first — which is exactly the set the percentile must exclude
     * rather than score as instant.
     */
    firstTokenAt: timestamp("first_token_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (table) => [
    // The reconnect query: the newest stream for a thread. Partial on the one
    // state that can be resumed, so the index stays small — a settled stream is
    // never looked up by this path, only swept.
    index("chat_stream_thread_live_idx")
      .on(table.threadId, table.createdAt.desc())
      .where(sql`${table.state} = 'streaming'`),
    // Serves the sweep of settled streams past their retention window.
    index("chat_stream_settled_at_idx").on(table.settledAt),
  ],
);

/**
 * The turn's wire output, stored as the Server-Sent Events text the client
 * would have received.
 *
 * Stored pre-encoded rather than as parsed chunks so replay is a byte copy:
 * the reconnect endpoint concatenates these in `seq` order and the AI SDK's
 * transport parses them exactly as it parses a live response. Nothing on this
 * path has to know the SDK's chunk union, so an SDK upgrade that adds a chunk
 * type cannot silently drop it from a resumed stream.
 *
 * One row holds a batch of events, not one event: a token-level delta arrives
 * every few milliseconds and a row per delta would put thousands of inserts on
 * the path of every answer.
 */
export const chatStreamChunk = pgTable(
  "chat_stream_chunk",
  {
    streamId: text("stream_id")
      .notNull()
      .references(() => chatStream.id, { onDelete: "cascade" }),
    /** Zero-based batch index. The replay order and the resume boundary. */
    seq: integer("seq").notNull(),
    /** Concatenated SSE text for this batch, including trailing blank lines. */
    payload: text("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.streamId, table.seq] })],
);

/**
 * A file a user attached to a message, bytes and all.
 *
 * In Postgres rather than an object store, for the same reason the rate
 * limiter is (see `db/schema/limits-schema.ts`): it removes a second system
 * that can be down, and it keeps deletion a single transaction rather than a
 * local commit plus a remote call that can fail on its own. It also makes
 * every read ownership-checked by construction — there is no URL anywhere that
 * works without a session.
 *
 * What it costs is honest to state: the database carries the bytes, and a turn
 * that re-reads an attachment pays a row read rather than a cache hit. The
 * ceilings in `lib/ai/attachments.ts` are what keep that bounded.
 *
 * `thread_id` is null until the turn carrying the attachment is committed: the
 * file is uploaded while the user is still typing, and on a brand-new chat the
 * thread does not exist yet.
 */
export const attachment = pgTable(
  "attachment",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    threadId: text("thread_id").references(() => thread.id, { onDelete: "cascade" }),
    /** The file itself. Read only by `/api/attachments/[id]` and the turn that uses it. */
    data: bytea("data").notNull(),
    filename: text("filename").notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Serves both the ownership check on read and the sweep of uploads that
    // were never attached to a message.
    index("attachment_user_created_idx").on(table.userId, table.createdAt.desc()),
    index("attachment_thread_idx").on(table.threadId),
  ],
);
