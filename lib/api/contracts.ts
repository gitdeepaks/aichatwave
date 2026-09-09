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

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  checks: z.object({
    database: z.enum(["ok", "failing"]),
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
