/**
 * Single source of truth for model ids, providers, and plan tiers.
 * Client-safe: pure data and guards only, no env access or provider SDKs.
 *
 * The id tuple is declared first and the registry is checked against it with
 * `satisfies`, so the two cannot drift and neither needs a type assertion.
 * Provider options are typed per provider rather than as a loose bag, so a
 * misplaced option is a compile error instead of a silently ignored field.
 */

export type ModelProvider = "openai" | "google" | "anthropic";
export type ModelTier = "free" | "subscription";

export const MODEL_IDS = [
  "gpt-5-mini",
  "gpt-5-nano",
  "gemini-3.1-pro",
  "claude-sonnet-4-20250514",
] as const;

export type ModelId = (typeof MODEL_IDS)[number];

export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

export type OpenAiModelOptions = {
  reasoning?: { effort: ReasoningEffort };
};

export type GoogleModelOptions = {
  temperature?: number;
  maxOutputTokens?: number;
};

export type AnthropicModelOptions = {
  temperature?: number;
  maxTokens?: number;
};

export type ModelConfig =
  | { provider: "openai"; tier: ModelTier; options?: OpenAiModelOptions }
  | { provider: "google"; tier: ModelTier; options?: GoogleModelOptions }
  | { provider: "anthropic"; tier: ModelTier; options?: AnthropicModelOptions };

export const MODEL_REGISTRY = {
  "gpt-5-mini": {
    provider: "openai",
    tier: "free",
    options: { reasoning: { effort: "low" } },
  },
  "gpt-5-nano": {
    provider: "openai",
    tier: "free",
    options: { reasoning: { effort: "low" } },
  },
  "gemini-3.1-pro": {
    provider: "google",
    tier: "subscription",
    options: { temperature: 0 },
  },
  "claude-sonnet-4-20250514": {
    provider: "anthropic",
    tier: "subscription",
  },
} satisfies Record<ModelId, ModelConfig>;

export const DEFAULT_MODEL_ID: ModelId = "gpt-5-nano";

export function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && value in MODEL_REGISTRY;
}

export function getEffectiveModelId(value: unknown): ModelId {
  if (isModelId(value)) {
    return value;
  }
  return DEFAULT_MODEL_ID;
}

export function getModelConfig(modelId: ModelId): ModelConfig {
  return MODEL_REGISTRY[modelId];
}

/** Pure access policy: free-tier models are open, subscription models need an active plan. */
export function isModelAccessible(modelId: ModelId, hasActiveSubscription: boolean): boolean {
  return MODEL_REGISTRY[modelId].tier === "free" || hasActiveSubscription;
}
