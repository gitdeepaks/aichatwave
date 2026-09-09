/**
 * Domain record → wire DTO conversion.
 *
 * Kept apart from the repositories so the database shape and the public API
 * shape can evolve independently: renaming a column must not silently rename a
 * JSON field that clients depend on. Every function here returns a type from
 * `lib/api/contracts`, so a contract change breaks these first.
 */

import type { MemoryDto, MessageDto, ThreadDto } from "@/lib/api/contracts";
import type { MessageRecord } from "@/server/db/message-repository";
import type { ThreadRecord } from "@/server/db/thread-repository";
import type { MemoryRecord } from "@/server/memory/memory-service";

export function toThreadDto(record: ThreadRecord): ThreadDto {
  return {
    id: record.id,
    title: record.title,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastMessageAt: record.lastMessageAt?.toISOString() ?? null,
    archived: record.archivedAt !== null,
    pinned: record.pinnedAt !== null,
  };
}

export function toMessageDto(record: MessageRecord): MessageDto {
  return {
    id: record.id,
    threadId: record.threadId,
    role: record.role,
    parts: record.parts,
    modelId: record.modelId,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toMemoryDto(record: MemoryRecord): MemoryDto {
  return {
    id: record.id,
    content: record.content,
    createdAt: record.createdAt.toISOString(),
  };
}
