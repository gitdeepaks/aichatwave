/**
 * Memory service: read, write, and search of long-term user memories.
 * Memory failures are intentionally non-fatal for chat — every failure is
 * logged with request/user context instead of crashing the conversation.
 */

import { z } from "zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { v4 as uuidv4 } from "uuid";
import { env } from "@/lib/env";
import { getStore } from "@/server/memory/store";
import { REMEMBER_MEMORY_PROMPT } from "@/server/chat/prompts";
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

function memoryNamespace(userId: string): string[] {
  return [userId, "memories"];
}

/** Lists all stored memories for a user, skipping records that fail validation. */
export async function listMemories(userId: string): Promise<MemoryRecord[]> {
  const store = await getStore();
  const items = await store.search(memoryNamespace(userId));

  return items.flatMap((item) => {
    const parsed = memoryValueSchema.safeParse(item.value);
    if (!parsed.success) return [];
    return [
      {
        id: item.key,
        content: parsed.data.data,
        createdAt: item.createdAt,
      },
    ];
  });
}

/**
 * Returns the user's memories formatted for prompt injection.
 * Non-fatal: returns "(empty)" and logs on failure.
 */
export async function getMemoriesPromptContent(
  userId: string,
  log: Logger = rootLogger,
): Promise<string> {
  try {
    const memories = await listMemories(userId);
    if (memories.length === 0) return EMPTY_MEMORIES_CONTENT;
    return memories.map((memory) => `- ${memory.content}`).join("\n");
  } catch (error) {
    log.error("memory.read_failed", { userId }, error);
    return EMPTY_MEMORIES_CONTENT;
  }
}

export async function saveMemory(userId: string, text: string): Promise<void> {
  const store = await getStore();
  await store.put(memoryNamespace(userId), uuidv4(), { data: text });
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

    const existingMemoriesContent = await getMemoriesPromptContent(userId, log);
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
