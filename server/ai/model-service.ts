/**
 * Model service: owns provider client setup for every model in the registry.
 * Server-only — reads provider API keys from validated env.
 */

import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { env } from "@/lib/env";
import {
  DEFAULT_MODEL_ID,
  getEffectiveModelId,
  getModelConfig,
  isModelAccessible,
  isModelId,
  MODEL_IDS,
  MODEL_REGISTRY,
  type ModelConfig,
  type ModelId,
} from "@/lib/ai/model-registry";

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
        apiKey: env.GOOGLE_API_KEY,
      });
    case "anthropic":
      return new ChatAnthropic({
        model: modelId,
        ...config.options,
        apiKey: env.ANTHROPIC_API_KEY,
      });
  }
}

export const getDynamicModel = (modelId: ModelId): DynamicChatModel => {
  return createModel(modelId, MODEL_REGISTRY[modelId]);
};
