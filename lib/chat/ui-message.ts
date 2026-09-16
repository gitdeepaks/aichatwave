/**
 * The app's `UIMessage` type and the metadata it carries.
 *
 * The AI SDK's `UIMessage` is generic over a metadata payload that the SDK
 * itself never inspects. Naming that payload here — rather than leaving it
 * `unknown` and reaching for a cast at each read — is what makes per-message
 * model attribution and cost display typed end to end: the server emits it as
 * a `message-metadata` chunk during the stream, the converter attaches the
 * same shape when history is read back from the database, and the renderer
 * reads one type in both cases.
 *
 * Client-safe: schemas and types only, no server imports.
 */

import type { UIMessage } from "ai";
import { z } from "zod";
import { MODEL_IDS, messageCostUsd, type ModelId } from "@/lib/ai/model-registry";

/**
 * Every field is optional because a message can legitimately lack all of them:
 * a user turn has no model, and a turn that was aborted before the provider
 * reported usage has no token counts. Parsed rather than trusted — it arrives
 * over the wire and out of a jsonb column.
 */
export const chatMessageMetadataSchema = z.object({
  modelId: z.enum(MODEL_IDS).nullable().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  createdAt: z.iso.datetime({ offset: true }).optional(),
});
export type ChatMessageMetadata = z.infer<typeof chatMessageMetadataSchema>;

/** The one message type the whole app uses. */
export type AppUIMessage = UIMessage<ChatMessageMetadata>;

export type MessageAttribution = {
  modelId: ModelId;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number | null;
};

/**
 * The attribution line for a message, or null when there is nothing honest to
 * show. A metadata object with a model but no usage still attributes the model
 * and reports zero tokens, which is the true state of an aborted turn.
 */
export function readAttribution(
  metadata: ChatMessageMetadata | undefined,
): MessageAttribution | null {
  const modelId = metadata?.modelId;
  if (modelId === undefined || modelId === null) return null;

  const inputTokens = metadata?.inputTokens ?? 0;
  const outputTokens = metadata?.outputTokens ?? 0;

  return {
    modelId,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: messageCostUsd({ modelId, inputTokens, outputTokens }),
  };
}

/** `$0.0023` — enough precision that a cheap turn is not rounded to nothing. */
export function formatCostUsd(costUsd: number): string {
  if (costUsd === 0) return "$0";
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  return `$${costUsd.toFixed(2)}`;
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  return `${Math.round(tokens / 100) / 10}k`;
}
