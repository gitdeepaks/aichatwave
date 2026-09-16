import { z } from "zod";
import { MAX_ATTACHMENTS_PER_MESSAGE } from "@/lib/ai/attachments";
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
  /**
   * Empty only when the turn carries attachments — "what is in this image?"
   * is a legitimate message whose text is the picture. Enforced below rather
   * than by `min(1)`, so the error names the real rule.
   */
  messageContent: z.string().trim().max(20_000),
  selectedModel: z.enum(MODEL_IDS).default(DEFAULT_MODEL_ID),
  /** Uploaded attachment ids, in display order. Ownership is checked server-side. */
  attachmentIds: z.array(z.string().min(1)).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
  /**
   * Redo the previous answer rather than add a turn.
   *
   * Sent by the Retry action, which may also change `selectedModel` — the
   * question is unchanged, so the user's message is neither re-sent nor
   * re-written, and the superseded answer is replaced in the same transaction
   * that writes the new one.
   */
  regenerate: z.boolean().default(false),
});

export const chatRequestWithContentSchema = chatRequestSchema.refine(
  (value) => value.messageContent.length > 0 || value.attachmentIds.length > 0,
  { path: ["messageContent"], message: "Write a message or attach a file." },
);

export type ChatRequest = z.infer<typeof chatRequestWithContentSchema>;

export type { ModelId };
