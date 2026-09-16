"use client";

import { Coins, Cpu } from "lucide-react";
import { MODEL_REGISTRY } from "@/lib/ai/model-registry";
import {
  formatCostUsd,
  formatTokenCount,
  readAttribution,
  type ChatMessageMetadata,
} from "@/lib/chat/ui-message";

/**
 * Display names for the model ids, keyed on `ModelId` so a model added to the
 * registry needs a label here before it compiles.
 */
const MODEL_LABELS: Record<keyof typeof MODEL_REGISTRY, string> = {
  "gpt-5-mini": "GPT-5 mini",
  "gpt-5-nano": "GPT-5 nano",
  "gemini-3.1-pro": "Gemini 3.1 Pro",
  "claude-sonnet-4-20250514": "Claude 4 Sonnet",
};

/**
 * Which model answered, and what it cost.
 *
 * Both numbers were already being persisted per message from Phase A and read
 * by nothing. The cost is list price from the registry, computed from the
 * provider's own reported token counts — it is a per-message figure for the
 * user, not a billing record, which remains Polar's.
 */
export function MessageAttribution({ metadata }: { metadata: ChatMessageMetadata | undefined }) {
  const attribution = readAttribution(metadata);
  if (attribution === null) return null;

  return (
    <div className="flex items-center gap-3 px-1 text-[11px] text-zinc-500">
      <span className="flex items-center gap-1">
        <Cpu className="size-3" aria-hidden />
        {MODEL_LABELS[attribution.modelId]}
      </span>

      {attribution.totalTokens > 0 ? (
        <span title={`${attribution.inputTokens} in · ${attribution.outputTokens} out`}>
          {formatTokenCount(attribution.totalTokens)} tokens
        </span>
      ) : null}

      {attribution.costUsd !== null && attribution.totalTokens > 0 ? (
        <span className="flex items-center gap-1">
          <Coins className="size-3" aria-hidden />
          {formatCostUsd(attribution.costUsd)}
        </span>
      ) : null}
    </div>
  );
}
