/**
 * The wire contract for the HTTP API.
 *
 * Both sides parse through these schemas: routes serialize domain records into
 * DTOs, and the client parses responses back. That makes the API boundary a
 * real type boundary rather than a place where `fetch` hands back `any`.
 *
 * Client-safe: schemas and types only, no server imports.
 */

import { z } from "zod";
import { messagePartsSchema } from "@/lib/ai/message-parts";
import { MODEL_IDS } from "@/lib/ai/model-registry";
import { CLIENT_REPORTED_SLO_IDS, MAX_CLIENT_LATENCY_MS } from "@/lib/observability/slo";

const isoDateTime = z.iso.datetime({ offset: true });

export const threadDtoSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  lastMessageAt: isoDateTime.nullable(),
  archived: z.boolean(),
  pinned: z.boolean(),
});
export type ThreadDto = z.infer<typeof threadDtoSchema>;

export const threadListResponseSchema = z.object({
  threads: z.array(threadDtoSchema),
  nextCursor: z.string().nullable(),
});
export type ThreadListResponse = z.infer<typeof threadListResponseSchema>;

export const threadViewSchema = z.enum(["active", "archived"]);
export type ThreadView = z.infer<typeof threadViewSchema>;

export const threadResponseSchema = z.object({ thread: threadDtoSchema });
export type ThreadResponse = z.infer<typeof threadResponseSchema>;

export const createThreadRequestSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
});
export type CreateThreadRequest = z.infer<typeof createThreadRequestSchema>;

export const updateThreadRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    archived: z.boolean().optional(),
    pinned: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined || value.archived !== undefined || value.pinned !== undefined,
    { message: "Provide at least one field to update." },
  );
export type UpdateThreadRequest = z.infer<typeof updateThreadRequestSchema>;

export const messageDtoSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  parts: messagePartsSchema,
  modelId: z.enum(MODEL_IDS).nullable(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  createdAt: isoDateTime,
});
export type MessageDto = z.infer<typeof messageDtoSchema>;

export const messageListResponseSchema = z.object({
  messages: z.array(messageDtoSchema),
  nextCursor: z.string().nullable(),
});
export type MessageListResponse = z.infer<typeof messageListResponseSchema>;

export const messageSearchResultDtoSchema = z.object({
  thread: threadDtoSchema,
  message: messageDtoSchema,
});
export type MessageSearchResultDto = z.infer<typeof messageSearchResultDtoSchema>;

export const messageSearchResponseSchema = z.object({
  results: z.array(messageSearchResultDtoSchema),
  nextCursor: z.string().nullable(),
});
export type MessageSearchResponse = z.infer<typeof messageSearchResponseSchema>;

/**
 * An uploaded file, as the composer holds it before the message is sent.
 *
 * `id` is this app's attachment id, not UploadThing's file key: the key is a
 * handle on private bytes and never leaves the server.
 */
export const attachmentDtoSchema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});
export type AttachmentDto = z.infer<typeof attachmentDtoSchema>;

export const memoryDtoSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  createdAt: isoDateTime,
});
export type MemoryDto = z.infer<typeof memoryDtoSchema>;

export const memoryListResponseSchema = z.object({
  memories: z.array(memoryDtoSchema),
});
export type MemoryListResponse = z.infer<typeof memoryListResponseSchema>;

/**
 * Long-term memory consent.
 *
 * `undecided` is a state the client must be able to see, not just a default it
 * infers from a missing field: it is what tells the onboarding dialog to ask,
 * and it is different from `declined`, which tells it not to ask again.
 */
export const memoryConsentStateSchema = z.enum(["undecided", "granted", "declined"]);
export type MemoryConsentStateDto = z.infer<typeof memoryConsentStateSchema>;

export const memoryConsentResponseSchema = z.object({
  state: memoryConsentStateSchema,
  decidedAt: isoDateTime.nullable(),
});
export type MemoryConsentResponse = z.infer<typeof memoryConsentResponseSchema>;

/** Only a real decision may be submitted; `undecided` is a server state, not a choice. */
export const updateMemoryConsentRequestSchema = z.object({
  decision: z.enum(["granted", "declined"]),
});
export type UpdateMemoryConsentRequest = z.infer<typeof updateMemoryConsentRequestSchema>;

export const healthCheckStateSchema = z.enum(["ok", "failing", "skipped"]);

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  checks: z.object({
    database: healthCheckStateSchema,
    /**
     * Only run with `?deep=1`. A revoked Polar token is invisible until someone
     * tries to pay, so it needs to be probeable — but not on every liveness
     * probe, which would burn Polar rate limit on a request that runs
     * constantly.
     */
    billing: healthCheckStateSchema,
  }),
  uptimeSeconds: z.number().nonnegative(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Shared query shape for every cursor-paginated list endpoint. */
export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

const queryBooleanSchema = z.enum(["true", "false"]).transform((value) => value === "true");

export const threadListQuerySchema = paginationQuerySchema.extend({
  view: threadViewSchema.default("active"),
  pinned: queryBooleanSchema.optional(),
});
export type ThreadListQuery = z.infer<typeof threadListQuerySchema>;

export const messageSearchQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(200),
});
export type MessageSearchQuery = z.infer<typeof messageSearchQuerySchema>;

/* ─── Client latency reports ──────────────────────────────────────────────── */

/**
 * One interaction the browser timed.
 *
 * `metric` is a closed enum of the three objectives only a client can observe
 * (`CLIENT_REPORTED_SLO_IDS`), so a signed-in user cannot invent an objective
 * or write into one the server measures for itself. `valueMs` is capped rather
 * than rejected at the ceiling: a backgrounded tab reports the wall clock it
 * actually experienced, and losing that sample would flatter the p95 more than
 * clamping it distorts it.
 */
export const clientLatencySampleSchema = z.object({
  metric: z.enum(CLIENT_REPORTED_SLO_IDS),
  valueMs: z
    .number()
    .nonnegative()
    .transform((value) => Math.min(value, MAX_CLIENT_LATENCY_MS)),
});
export type ClientLatencySample = z.infer<typeof clientLatencySampleSchema>;

/**
 * A batch, because these are sent with `navigator.sendBeacon` on page hide as
 * well as on a timer — one request carrying a minute of interaction rather
 * than a request per interaction, which would make the measurement the
 * dominant cost of the thing being measured.
 */
export const clientLatencyReportSchema = z.object({
  samples: z.array(clientLatencySampleSchema).min(1).max(50),
});
export type ClientLatencyReport = z.infer<typeof clientLatencyReportSchema>;

export const clientLatencyResponseSchema = z.object({ recorded: z.number().int().nonnegative() });
export type ClientLatencyResponse = z.infer<typeof clientLatencyResponseSchema>;

/* ─── Operations (admin only) ─────────────────────────────────────────────── */

/**
 * A model id as it appears in a *historical* row rather than a request.
 *
 * Not `z.enum(MODEL_IDS)`: `message.model_id` is plain text precisely so a
 * model retired from the registry does not make a year-old row unreadable. The
 * dashboard has to be able to show "claude-3-opus: $412" for spend that
 * genuinely happened on a model this deployment no longer offers.
 */
const recordedModelIdSchema = z.string().min(1);

export const costBucketDtoSchema = z.object({
  messages: z.number().int().nonnegative(),
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  /** Null when the model is no longer in the registry and has no price to quote. */
  costUsd: z.number().nonnegative().nullable(),
});
export type CostBucketDto = z.infer<typeof costBucketDtoSchema>;

export const costByDayDtoSchema = costBucketDtoSchema.extend({
  day: z.string().min(1),
});
export type CostByDayDto = z.infer<typeof costByDayDtoSchema>;

export const costByModelDtoSchema = costBucketDtoSchema.extend({
  modelId: recordedModelIdSchema,
  /** False for a model that has left the registry, so the UI can say why cost is missing. */
  priced: z.boolean(),
});
export type CostByModelDto = z.infer<typeof costByModelDtoSchema>;

export const spendAnomalyDtoSchema = z.object({
  anomalous: z.boolean(),
  /** Today's spend over the trailing median. Null when there is no baseline to divide by. */
  ratio: z.number().nullable(),
  reason: z.string().min(1),
});
export type SpendAnomalyDto = z.infer<typeof spendAnomalyDtoSchema>;

export const costByUserDtoSchema = costBucketDtoSchema.extend({
  userId: z.string().min(1),
  todayUsd: z.number().nonnegative(),
  anomaly: spendAnomalyDtoSchema,
});
export type CostByUserDto = z.infer<typeof costByUserDtoSchema>;

export const costReportResponseSchema = z.object({
  windowDays: z.number().int().positive(),
  generatedAt: isoDateTime,
  /** True when the row cap was hit, so the figures below are a floor, not a total. */
  truncated: z.boolean(),
  totals: costBucketDtoSchema,
  byDay: z.array(costByDayDtoSchema),
  byModel: z.array(costByModelDtoSchema),
  topUsers: z.array(costByUserDtoSchema),
});
export type CostReportResponse = z.infer<typeof costReportResponseSchema>;

export const costReportQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).optional(),
});
export type CostReportQuery = z.infer<typeof costReportQuerySchema>;

export const sloEvaluationDtoSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  unit: z.enum(["milliseconds", "ratio"]),
  status: z.enum(["healthy", "degraded", "paging", "insufficient_data"]),
  value: z.number().nullable(),
  sample: z.number().int().nonnegative(),
  objective: z.number(),
  pageAt: z.number(),
  /**
   * Whether the number describes the whole fleet or only the instance that
   * answered. Shown, not hidden: two of the four SLOs are counted in process
   * memory because nothing durable records them.
   */
  scope: z.enum(["fleet", "instance"]),
  runbook: z.string().min(1),
});
export type SloEvaluationDto = z.infer<typeof sloEvaluationDtoSchema>;

export const sloReportResponseSchema = z.object({
  windowMinutes: z.number().int().positive(),
  generatedAt: isoDateTime,
  paging: z.boolean(),
  objectives: z.array(sloEvaluationDtoSchema),
});
export type SloReportResponse = z.infer<typeof sloReportResponseSchema>;
