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

/**
 * The environment variable carrying each provider's API key.
 *
 * Declared here rather than in `lib/env.ts` so the registry stays the single
 * source of truth: adding a provider to `ModelProvider` is a compile error
 * until its key is named, and the env schema derives its requirements from
 * this map instead of restating them.
 */
export const PROVIDER_ENV_KEYS = {
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
} as const satisfies Record<ModelProvider, string>;

export type ProviderEnvKey = (typeof PROVIDER_ENV_KEYS)[ModelProvider];

/**
 * The provider the default model needs, and therefore the one whose key the
 * env schema requires at boot.
 *
 * Derived from `DEFAULT_MODEL_ID` rather than declared, so moving the default
 * to another provider moves the boot requirement with it. Declared as a
 * constant, this drifted silently: the schema would keep demanding the old
 * provider's key while every chat failed for want of the new one.
 *
 * Note this is *not* the same as "OpenAI is required" — `lib/env.ts` requires
 * OPENAI_API_KEY unconditionally, because memory extraction and the pgvector
 * embeddings call it regardless of which chat model is selected. The two
 * happen to coincide today only because the default model is an OpenAI one.
 */
export function defaultModelProvider(): ModelProvider {
  return MODEL_REGISTRY[DEFAULT_MODEL_ID].provider;
}

export function getProviderEnvKey(provider: ModelProvider): ProviderEnvKey {
  return PROVIDER_ENV_KEYS[provider];
}

/** Every provider at least one registry model needs, in registry order. */
export function registryProviders(): ModelProvider[] {
  const seen = new Set<ModelProvider>();
  for (const modelId of MODEL_IDS) {
    seen.add(MODEL_REGISTRY[modelId].provider);
  }
  return [...seen];
}

/**
 * Whether this deployment can actually serve a model.
 *
 * Access (`isModelAccessible`) asks whether the *user's plan* allows a model;
 * availability asks whether the *deployment* is configured to run it at all.
 * They are separate failures with separate causes: one is a 403 the user can
 * fix by upgrading, the other a 503 only an operator can fix.
 */
export function isModelAvailable(
  modelId: ModelId,
  configuredProviders: ReadonlySet<ModelProvider>,
): boolean {
  return configuredProviders.has(MODEL_REGISTRY[modelId].provider);
}

/** Models this deployment is configured to serve, in registry order. */
export function availableModelIds(configuredProviders: ReadonlySet<ModelProvider>): ModelId[] {
  return MODEL_IDS.filter((modelId) => isModelAvailable(modelId, configuredProviders));
}

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
