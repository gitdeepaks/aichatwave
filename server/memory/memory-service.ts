/**
 * Memory service: read, write, search, and deletion of long-term user memories.
 *
 * Memory failures are intentionally non-fatal for chat — every failure is
 * logged with request/user context instead of crashing the conversation.
 *
 * Prompt injection is bounded and ranked. The store has always written OpenAI
 * embeddings behind an HNSW cosine index; it previously read them back with an
 * unfiltered `search()` that returned every memory a user had ever saved, so
 * the embeddings were paid for and never used and the system prompt grew
 * without limit. Retrieval now passes the current message as a query vector and
 * caps the result at `MEMORY_PROMPT_LIMIT`.
 */

import { z } from "zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { MEMORY_PROMPT_LIMIT } from "@/lib/ai/memory-config";
import { getStore } from "@/server/memory/store";
import { REMEMBER_MEMORY_PROMPT } from "@/server/chat/prompts";
import { AppError } from "@/server/lib/app-error";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const memoryValueSchema = z.object({
  data: z.string(),
});

const memoryItemSchema = z.object({
  text: z.string().describe("Atomic user memory as a short sentence"),
  is_new: z.boolean().describe("True if this memory is NEW. False if duplicate."),
});

const memoryDecisionSchema = z.object({
  should_write: z.boolean().describe("Whether to store any memories"),
  memories: z.array(memoryItemSchema),
});

export type MemoryDecision = z.infer<typeof memoryDecisionSchema>;

export type MemoryRecord = {
  id: string;
  content: string;
  createdAt: Date;
};

const EMPTY_MEMORIES_CONTENT = "(empty)";
const MEMORY_EXTRACTION_MODEL = "gpt-5-nano";
const MIN_MESSAGE_LENGTH_FOR_MEMORY = 5;
/** Upper bound for the Memory Center listing. */
const MEMORY_LIST_LIMIT = 500;

function memoryNamespace(userId: string): string[] {
  return [userId, "memories"];
}

type StoredMemoryItem = {
  key: string;
  value: unknown;
  createdAt: Date;
};

function toMemoryRecords(items: StoredMemoryItem[]): MemoryRecord[] {
  return items.flatMap((item) => {
    const parsed = memoryValueSchema.safeParse(item.value);
    if (!parsed.success) return [];
    return [{ id: item.key, content: parsed.data.data, createdAt: item.createdAt }];
  });
}

/** Every memory a user has stored, newest first. Backs the Memory Center. */
export async function listMemories(userId: string): Promise<MemoryRecord[]> {
  const store = getStore();
  const items = await store.search(memoryNamespace(userId), { limit: MEMORY_LIST_LIMIT });

  return toMemoryRecords(items).sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
}

/**
 * The memories most relevant to `query`, ranked by the vector index.
 * Falls back to an unranked page when no query is available.
 */
export async function searchMemories(params: {
  userId: string;
  query?: string | undefined;
  limit?: number;
}): Promise<MemoryRecord[]> {
  const store = getStore();
  const limit = params.limit ?? MEMORY_PROMPT_LIMIT;
  const trimmedQuery = params.query?.trim();

  const items = await store.search(memoryNamespace(params.userId), {
    limit,
    ...(trimmedQuery ? { query: trimmedQuery } : {}),
  });

  return toMemoryRecords(items);
}

/**
 * Returns the user's most relevant memories formatted for prompt injection,
 * bounded by `MEMORY_PROMPT_LIMIT`.
 * Non-fatal: returns "(empty)" and logs on failure.
 */
export async function getMemoriesPromptContent(
  params: { userId: string; query?: string | undefined },
  log: Logger = rootLogger,
): Promise<string> {
  try {
    const memories = await searchMemories(params);
    if (memories.length === 0) return EMPTY_MEMORIES_CONTENT;
    return memories.map((memory) => `- ${memory.content}`).join("\n");
  } catch (error) {
    log.error("memory.read_failed", { userId: params.userId }, error);
    return EMPTY_MEMORIES_CONTENT;
  }
}

export async function saveMemory(userId: string, text: string): Promise<MemoryRecord> {
  const store = getStore();
  const id = randomUUID();
  await store.put(memoryNamespace(userId), id, { data: text });
  return { id, content: text, createdAt: new Date() };
}

/** Removes one memory. Throws a typed 404 when the user has no such memory. */
export async function deleteMemory(params: {
  userId: string;
  memoryId: string;
  log?: Logger;
}): Promise<void> {
  const store = getStore();
  const existing = await store.get(memoryNamespace(params.userId), params.memoryId);

  if (!existing) {
    throw new AppError("NOT_FOUND", "That memory no longer exists.");
  }

  await store.delete(memoryNamespace(params.userId), params.memoryId);
  params.log?.info("memory.deleted", { memoryId: params.memoryId });
}

async function decideMemoriesToStore(params: {
  messageContent: string;
  existingMemoriesContent: string;
}): Promise<MemoryDecision | null> {
  const systemPrompt = await REMEMBER_MEMORY_PROMPT.format({
    user_details_content: params.existingMemoriesContent,
  });

  const response = await openai.responses.parse({
    model: MEMORY_EXTRACTION_MODEL,
    input: [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: `USER MESSAGE:\n${params.messageContent}` },
    ],
    text: {
      format: zodTextFormat(memoryDecisionSchema, "memory_extractor"),
    },
  });

  return response.output_parsed ?? null;
}

/**
 * Extracts long-term memories from a user message and stores the new ones.
 * Non-fatal: failures are logged with full context and never thrown.
 */
export async function extractAndStoreMemories(params: {
  userId: string;
  messageContent: string;
  log?: Logger;
}): Promise<void> {
  const { userId, messageContent } = params;
  const log = params.log ?? rootLogger;

  try {
    if (messageContent.trim().length < MIN_MESSAGE_LENGTH_FOR_MEMORY) return;

    const existingMemoriesContent = await getMemoriesPromptContent(
      { userId, query: messageContent },
      log,
    );
    const decision = await decideMemoriesToStore({
      messageContent,
      existingMemoriesContent,
    });

    if (!decision?.should_write) return;

    for (const memory of decision.memories) {
      const text = memory.text.trim();
      if (memory.is_new && text.length > 0) {
        await saveMemory(userId, text);
      }
    }
  } catch (error) {
    log.error("memory.extract_failed", { userId }, error);
  }
}
