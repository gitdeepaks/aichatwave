import { z } from "zod";
import { DEFAULT_MODEL_ID, MODEL_IDS, type ModelId } from "@/lib/ai/model-registry";

/**
 * The chat request contract.
 *
 * `selectedModel` is a Zod enum built from the model registry, so an unknown id
 * is a validation error naming the field rather than a silent fallback, and the
 * parsed value is a `ModelId` with no narrowing left to do downstream.
 */
export const chatRequestSchema = z.object({
  threadId: z.string().trim().min(1),
  messageContent: z.string().trim().min(1).max(20_000),
  selectedModel: z.enum(MODEL_IDS).default(DEFAULT_MODEL_ID),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type { ModelId };
