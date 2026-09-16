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
