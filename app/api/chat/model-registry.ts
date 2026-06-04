type ModelProvider = "openai" | "google" | "anthropic";
type ModelTier = "free" | "subscription";

export type ModelConfig = {
  provider: ModelProvider;
  tier: ModelTier;
  options?: Record<string, unknown>;
};

export const MODEL_REGISTRY = {
  "gpt-5-mini": {
    provider: "openai",
    tier: "free",
    options: {
      reasoning: {
        effort: "low",
      },
    },
  },
  "gpt-5-nano": {
    provider: "openai",
    tier: "free",
    options: {
      reasoning: {
        effort: "low",
      },
    },
  },
  "gemini-3.1-pro": {
    provider: "google",
    tier: "subscription",
    options: {
      temperature: 0,
    },
  },
  "claude-sonnet-4-20250514": {
    provider: "anthropic",
    tier: "subscription",
  },
} satisfies Record<string, ModelConfig>;

export type ModelId = keyof typeof MODEL_REGISTRY;

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
