import assert from "node:assert/strict";
import test from "node:test";
import {
  fallbackModelId,
  MODEL_REGISTRY,
  registryProviders,
  type ModelProvider,
} from "@/lib/ai/model-registry";

const ALL: ReadonlySet<ModelProvider> = new Set(registryProviders());

function without(provider: ModelProvider): ReadonlySet<ModelProvider> {
  return new Set(registryProviders().filter((candidate) => candidate !== provider));
}

test("a subscription model falls back to another provider's subscription model", () => {
  const fallback = fallbackModelId({
    modelId: "claude-sonnet-4-20250514",
    available: ALL,
    healthy: without("anthropic"),
  });

  assert.ok(fallback !== null);
  assert.notEqual(MODEL_REGISTRY[fallback].provider, "anthropic");
  assert.equal(MODEL_REGISTRY[fallback].tier, "subscription");
});

test("a free-tier user is never silently upgraded to a paid model", () => {
  const fallback = fallbackModelId({
    modelId: "gpt-5-nano",
    available: ALL,
    healthy: without("openai"),
  });

  // Both free models are OpenAI's, so during an OpenAI outage there is nothing
  // honest to fall back to — and handing out Claude for free is not it.
  assert.equal(fallback, null);
});

test("the fallback is never on the failing provider", () => {
  const fallback = fallbackModelId({
    modelId: "gemini-3.1-pro",
    available: ALL,
    healthy: ALL,
  });

  assert.ok(fallback !== null);
  assert.notEqual(MODEL_REGISTRY[fallback].provider, "google");
});

test("a provider this deployment holds no key for is never chosen", () => {
  const fallback = fallbackModelId({
    modelId: "claude-sonnet-4-20250514",
    available: new Set<ModelProvider>(["anthropic"]),
    healthy: ALL,
  });

  assert.equal(fallback, null);
});

test("a provider whose breaker is open is never chosen", () => {
  const fallback = fallbackModelId({
    modelId: "claude-sonnet-4-20250514",
    available: ALL,
    healthy: new Set<ModelProvider>(["anthropic"]),
  });

  assert.equal(fallback, null);
});

test("a subscription model always has somewhere to go while two providers are up", () => {
  const fromAnthropic = fallbackModelId({
    modelId: "claude-sonnet-4-20250514",
    available: ALL,
    healthy: without("anthropic"),
  });
  assert.ok(fromAnthropic !== null);

  const fromGoogle = fallbackModelId({
    modelId: "gemini-3.1-pro",
    available: ALL,
    healthy: without("google"),
  });
  assert.ok(fromGoogle !== null);
});
