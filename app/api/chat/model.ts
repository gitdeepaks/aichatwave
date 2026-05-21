import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";

type ModelProvider = "openai" | "google" | "anthropic";
type ModelTier = "free" | "subscription";

type ModelId = "gpt-5-mini" | "gpt-5-nano" | "gemini-3.1-pro" | "claude-sonnet-4-20250514";

type DynamicChatModel = ChatOpenAI | ChatGoogleGenerativeAI | ChatAnthropic;

export type ModelConfig = {
  provider: ModelProvider;
  tier: ModelTier;
  options?: Record<string, unknown>;
};

export const MODEL_REGISTRY: Record<ModelId, ModelConfig> = {
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
};
const defaultModel = new ChatOpenAI({
  model: "gpt-5-nano",
  maxTokens: undefined,
  maxRetries: 2,
  timeout: 60000,
  apiKey: process.env.OPENAI_API_KEY,
});

function isModelId(modelId: string): modelId is ModelId {
  return modelId in MODEL_REGISTRY;
}

function createModel(modelId: ModelId, config: ModelConfig): DynamicChatModel {
  const base = { model: modelId, ...config.options };

  if (config.provider === "openai") {
    return new ChatOpenAI({
      ...base,
      apiKey: process.env.OPENAI_API_KEY,
    });
  } else if (config.provider === "google") {
    return new ChatGoogleGenerativeAI({
      ...base,
      apiKey: process.env.GOOGLE_API_KEY,
    });
  } else if (config.provider === "anthropic") {
    return new ChatAnthropic({ ...base, apiKey: process.env.ANTHROPIC_API_KEY });
  } else {
    return defaultModel;
  }
}
/** Same id `getDynamicModel` actually uses when the request omits or unknown model id. */
export function getEffectiveModelId(modelId: string | undefined): ModelId {
  if (modelId && isModelId(modelId)) {
    return modelId;
  }
  return "gpt-5-nano";
}

export const getDynamicModel = (modelId: string) => {
  const resolved = getEffectiveModelId(modelId);
  const config = MODEL_REGISTRY[resolved];

  if (!config) return defaultModel;

  return createModel(resolved, config);
};
