/**
 * Model service: owns provider client setup for every model in the registry.
 * Server-only — reads provider API keys from validated env.
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { configuredProviders, env } from "@/lib/env";
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
  type ModelConfig,
  type ModelId,
} from "@/lib/ai/model-registry";
import { AppError } from "@/server/lib/app-error";

export type DynamicChatModel = ChatOpenAI | ChatGoogleGenerativeAI | ChatAnthropic;

export {
  DEFAULT_MODEL_ID,
  getEffectiveModelId,
  getModelConfig,
  isModelAccessible,
  isModelId,
  MODEL_IDS,
  MODEL_REGISTRY,
};
export type { ModelConfig, ModelId };

/** Models this deployment holds provider credentials for. */
export function getAvailableModelIds(): ModelId[] {
  return availableModelIds(configuredProviders);
}

/**
 * Throws a typed 503 when a model's provider has no key on this deployment.
 *
 * Distinct from `assertModelAccess`, which is a 403 about the user's plan.
 * Without this the missing key reaches the provider SDK and surfaces as an
 * opaque vendor auth error that reads like an outage.
 */
export function assertModelAvailable(modelId: ModelId): void {
  if (isModelAvailable(modelId, configuredProviders)) return;

  const provider = MODEL_REGISTRY[modelId].provider;
  throw new AppError(
    "SERVICE_UNAVAILABLE",
    "That model isn't available on this deployment. Please choose a different model.",
    {
      cause: new Error(
        `${modelId} needs provider "${provider}", but ${getProviderEnvKey(provider)} is not set.`,
      ),
    },
  );
}

/**
 * The switch is exhaustive over `ModelConfig`'s discriminant, so adding a
 * provider to the registry is a compile error here until it is handled.
 * Options are provider-specific types, so they are checked against the client
 * they are spread into rather than being an untyped bag.
 */
function createModel(modelId: ModelId, config: ModelConfig): DynamicChatModel {
  switch (config.provider) {
    case "openai":
      return new ChatOpenAI({
        model: modelId,
        ...config.options,
        apiKey: env.OPENAI_API_KEY,
      });
    case "google":
      return new ChatGoogleGenerativeAI({
        model: modelId,
        ...config.options,
        apiKey: requireProviderKey(modelId, env.GOOGLE_API_KEY),
      });
    case "anthropic":
      return new ChatAnthropic({
        model: modelId,
        ...config.options,
        apiKey: requireProviderKey(modelId, env.ANTHROPIC_API_KEY),
      });
  }
}

/**
 * Narrows an optional provider key to `string`, or throws the same typed 503
 * `assertModelAvailable` would. Both paths exist because the assertion runs at
 * the service boundary while this runs at the SDK boundary — a caller that
 * reaches `getDynamicModel` another way still fails cleanly rather than handing
 * the SDK an undefined key.
 */
function requireProviderKey(modelId: ModelId, key: string | undefined): string {
  if (key !== undefined) return key;
  assertModelAvailable(modelId);
  // Unreachable: the model is available, so its key is set.
  throw new AppError("SERVICE_UNAVAILABLE", "That model isn't available on this deployment.");
}

export const getDynamicModel = (modelId: ModelId): DynamicChatModel => {
  assertModelAvailable(modelId);
  return createModel(modelId, MODEL_REGISTRY[modelId]);
};
