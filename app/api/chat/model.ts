import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";
import { env } from "@/lib/env";
import {
  DEFAULT_MODEL_ID,
  getEffectiveModelId,
  isModelId,
  MODEL_REGISTRY,
  type ModelConfig,
  type ModelId,
} from "@/app/api/chat/model-registry";

type DynamicChatModel = ChatOpenAI | ChatGoogleGenerativeAI | ChatAnthropic;

export { DEFAULT_MODEL_ID, getEffectiveModelId, isModelId, MODEL_REGISTRY };
export type { ModelConfig, ModelId };

function createModel(modelId: ModelId, config: ModelConfig): DynamicChatModel {
  const base = { model: modelId, ...config.options };

  switch (config.provider) {
    case "openai":
      return new ChatOpenAI({
        ...base,
        apiKey: env.OPENAI_API_KEY,
      });
    case "google":
      return new ChatGoogleGenerativeAI({
        ...base,
        apiKey: env.GOOGLE_API_KEY,
      });
    case "anthropic":
      return new ChatAnthropic({ ...base, apiKey: env.ANTHROPIC_API_KEY });
  }

  config.provider satisfies never;
}

export const getDynamicModel = (modelId: ModelId): DynamicChatModel => {
  return createModel(modelId, MODEL_REGISTRY[modelId]);
};
