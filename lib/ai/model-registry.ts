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

/**
 * What a model can be shown, beyond text.
 *
 * Declared per model rather than assumed per provider: a provider ships
 * text-only models alongside multimodal ones, and the composer has to refuse
 * an attachment the selected model cannot read *before* it is uploaded.
 */
export type ModelModalities = {
  image: boolean;
  pdf: boolean;
};

/**
 * List price in US dollars per million tokens, as published by the provider.
 *
 * Carried here so the per-message cost the UI shows is derived from the same
 * table the model is chosen from, and adding a model is a compile error until
 * its price is stated. These are list prices for display, not a billing
 * record — Polar remains the billing record.
 */
export type ModelPricing = {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
};

type ModelFacts = {
  tier: ModelTier;
  modalities: ModelModalities;
  pricing: ModelPricing;
};

export type ModelConfig = ModelFacts &
  (
    | { provider: "openai"; options?: OpenAiModelOptions }
    | { provider: "google"; options?: GoogleModelOptions }
    | { provider: "anthropic"; options?: AnthropicModelOptions }
  );

export const MODEL_REGISTRY = {
  "gpt-5-mini": {
    provider: "openai",
    tier: "free",
    modalities: { image: true, pdf: true },
    pricing: { inputPerMillionUsd: 0.25, outputPerMillionUsd: 2 },
    options: { reasoning: { effort: "low" } },
  },
  "gpt-5-nano": {
    provider: "openai",
    tier: "free",
    modalities: { image: true, pdf: true },
    pricing: { inputPerMillionUsd: 0.05, outputPerMillionUsd: 0.4 },
    options: { reasoning: { effort: "low" } },
  },
  "gemini-3.1-pro": {
    provider: "google",
    tier: "subscription",
    modalities: { image: true, pdf: true },
    pricing: { inputPerMillionUsd: 1.25, outputPerMillionUsd: 10 },
    options: { temperature: 0 },
  },
  "claude-sonnet-4-20250514": {
    provider: "anthropic",
    tier: "subscription",
    modalities: { image: true, pdf: true },
    pricing: { inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
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

export function getModelModalities(modelId: ModelId): ModelModalities {
  return MODEL_REGISTRY[modelId].modalities;
}

/**
 * Whether `modelId` can read an attachment of this kind.
 *
 * Takes the kind rather than the media type so the caller is forced through
 * `attachmentKindOf`, which is the allowlist — a media type this product does
 * not accept never reaches a capability question.
 */
export function modelAcceptsAttachmentKind(modelId: ModelId, kind: "image" | "pdf"): boolean {
  return MODEL_REGISTRY[modelId].modalities[kind];
}

export function getModelPricing(modelId: ModelId): ModelPricing {
  return MODEL_REGISTRY[modelId].pricing;
}

/**
 * List cost of one message, in US dollars.
 *
 * Returns null for a message with no recorded model — a user turn, or an
 * assistant turn written before token counts were persisted — so the UI can
 * omit the figure instead of showing a confident `$0.0000`.
 */
export function messageCostUsd(params: {
  modelId: ModelId | null;
  inputTokens: number;
  outputTokens: number;
}): number | null {
  if (params.modelId === null) return null;
  const pricing = getModelPricing(params.modelId);
  return (
    (params.inputTokens * pricing.inputPerMillionUsd +
      params.outputTokens * pricing.outputPerMillionUsd) /
    1_000_000
  );
}

/** Pure access policy: free-tier models are open, subscription models need an active plan. */
export function isModelAccessible(modelId: ModelId, hasActiveSubscription: boolean): boolean {
  return MODEL_REGISTRY[modelId].tier === "free" || hasActiveSubscription;
}

/**
 * Tier ordering, so "do not silently upgrade the user" is arithmetic rather
 * than a pair of if-statements that has to be revisited when a tier is added.
 */
const TIER_RANK: Record<ModelTier, number> = { free: 0, subscription: 1 };

/**
 * The model to answer with when `modelId`'s provider is failing, or null when
 * there is nothing honest to fall back to.
 *
 * Three constraints, in order:
 *
 *  - **A different provider.** Falling back within the failing provider is not
 *    a fallback; it is the same outage with a different model name.
 *  - **Configured and healthy.** `available` is "this deployment holds a key",
 *    `healthy` is "this provider's circuit breaker is closed". Both must hold,
 *    or the fallback fails the same way the original call did.
 *  - **Same tier or lower.** A free-tier user must never be quietly served a
 *    subscription model — that is unbilled spend, and it teaches them the
 *    paywall is soft. Preferring the same tier first keeps a Pro user's answer
 *    at the quality they paid for whenever that is still possible.
 *
 * Returning null is a real outcome and the caller must handle it: during an
 * OpenAI outage a free-tier user has no fallback, because both free models are
 * OpenAI's. Failing the turn is the correct answer there, and it is better
 * than the alternative of handing out Claude for free.
 */
export function fallbackModelId(params: {
  modelId: ModelId;
  /** Providers this deployment holds a key for. */
  available: ReadonlySet<ModelProvider>;
  /** Providers whose circuit breaker is closed. */
  healthy: ReadonlySet<ModelProvider>;
}): ModelId | null {
  const failingProvider = MODEL_REGISTRY[params.modelId].provider;
  const requestedRank = TIER_RANK[MODEL_REGISTRY[params.modelId].tier];

  const candidates = MODEL_IDS.filter((candidate) => {
    const config = MODEL_REGISTRY[candidate];
    if (config.provider === failingProvider) return false;
    if (!params.available.has(config.provider)) return false;
    if (!params.healthy.has(config.provider)) return false;
    return TIER_RANK[config.tier] <= requestedRank;
  });

  // Same tier first, then lower; registry order breaks ties, so the choice is
  // deterministic and reviewable rather than "whichever the filter met first".
  const sameTier = candidates.find(
    (candidate) => TIER_RANK[MODEL_REGISTRY[candidate].tier] === requestedRank,
  );
  return sameTier ?? candidates[0] ?? null;
}
