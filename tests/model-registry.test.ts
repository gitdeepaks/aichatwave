import assert from "node:assert/strict";
import test from "node:test";
import {
  availableModelIds,
  DEFAULT_MODEL_ID,
  getEffectiveModelId,
  getModelConfig,
  getProviderEnvKey,
  isModelAccessible,
  isModelAvailable,
  isModelId,
  MODEL_IDS,
  MODEL_REGISTRY,
  PROVIDER_ENV_KEYS,
  registryProviders,
  defaultModelProvider,
  type ModelProvider,
} from "@/lib/ai/model-registry";

test("isModelId accepts registry ids and rejects everything else", () => {
  for (const id of Object.keys(MODEL_REGISTRY)) {
    assert.equal(isModelId(id), true);
  }
  assert.equal(isModelId("gpt-99-ultra"), false);
  assert.equal(isModelId(undefined), false);
  assert.equal(isModelId(42), false);
});

test("getEffectiveModelId falls back to the default model", () => {
  assert.equal(getEffectiveModelId("gpt-5-mini"), "gpt-5-mini");
  assert.equal(getEffectiveModelId("not-a-model"), DEFAULT_MODEL_ID);
  assert.equal(getEffectiveModelId(undefined), DEFAULT_MODEL_ID);
});

test("free models are accessible without a subscription", () => {
  assert.equal(isModelAccessible("gpt-5-mini", false), true);
  assert.equal(isModelAccessible("gpt-5-nano", false), true);
});

test("subscription models require an active subscription", () => {
  assert.equal(isModelAccessible("gemini-3.1-pro", false), false);
  assert.equal(isModelAccessible("claude-sonnet-4-20250514", false), false);
  assert.equal(isModelAccessible("gemini-3.1-pro", true), true);
  assert.equal(isModelAccessible("claude-sonnet-4-20250514", true), true);
});

test("the default model is on the free tier", () => {
  assert.equal(getModelConfig(DEFAULT_MODEL_ID).tier, "free");
});

test("every registry provider has an env key named for it", () => {
  for (const provider of registryProviders()) {
    const key = getProviderEnvKey(provider);
    assert.equal(typeof key, "string");
    assert.ok(key.length > 0, `${provider} has no env key`);
  }
  // The map covers the union, not just what the registry happens to use today.
  assert.deepEqual(Object.keys(PROVIDER_ENV_KEYS).sort(), ["anthropic", "google", "openai"]);
});

test("registryProviders returns each provider once", () => {
  const providers = registryProviders();
  assert.deepEqual([...new Set(providers)], providers);
  // Two OpenAI models are registered; the provider must not appear twice.
  assert.ok(providers.includes("openai"));
});

test("the boot guard's provider tracks the default model", () => {
  // `lib/env.ts` requires `getProviderEnvKey(defaultModelProvider())` at boot.
  // This asserts the derivation is live rather than a constant that could
  // drift: change DEFAULT_MODEL_ID and the required key must follow.
  assert.equal(defaultModelProvider(), getModelConfig(DEFAULT_MODEL_ID).provider);

  for (const modelId of MODEL_IDS) {
    const provider = getModelConfig(modelId).provider;
    assert.ok(
      Object.values(PROVIDER_ENV_KEYS).includes(getProviderEnvKey(provider)),
      `${modelId}'s provider has no env key`,
    );
  }
});

test("availability follows configured providers, not the user's plan", () => {
  const openAiOnly: ReadonlySet<ModelProvider> = new Set<ModelProvider>(["openai"]);

  assert.equal(isModelAvailable("gpt-5-mini", openAiOnly), true);
  assert.equal(isModelAvailable("gemini-3.1-pro", openAiOnly), false);
  assert.equal(isModelAvailable("claude-sonnet-4-20250514", openAiOnly), false);

  // A subscription does not conjure a provider key.
  assert.equal(isModelAccessible("gemini-3.1-pro", true), true);
  assert.equal(isModelAvailable("gemini-3.1-pro", openAiOnly), false);
});

test("an OpenAI-only deployment still serves the default model", () => {
  // This is the Phase B exit criterion: a fresh clone with only OPENAI_API_KEY
  // set must boot and be able to chat.
  const openAiOnly: ReadonlySet<ModelProvider> = new Set<ModelProvider>(["openai"]);
  const available = availableModelIds(openAiOnly);

  assert.ok(available.includes(DEFAULT_MODEL_ID));
  assert.deepEqual(available, ["gpt-5-mini", "gpt-5-nano"]);
});

test("a fully configured deployment serves every registered model", () => {
  const all: ReadonlySet<ModelProvider> = new Set(registryProviders());
  assert.deepEqual(availableModelIds(all), [...MODEL_IDS]);
});

test("no configured providers means no available models", () => {
  assert.deepEqual(availableModelIds(new Set<ModelProvider>()), []);
});
