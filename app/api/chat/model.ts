import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatAnthropic } from "@langchain/anthropic";

type ModelProvider = "openai" | "google" | "anthropic";
type ModelTier = "free" | "subscription";

type ModelId = "gpt-5-mini" | "gpt-5-nano" | "gemini-3.1-pro" | "claude-sonnet-4-20250514";

type DynamicChatModel = ChatOpenAI | ChatGoogleGenerativeAI | ChatAnthropic;

type ModelConfig = {
  provider: ModelProvider;
  tier: ModelTier;
  options?: Record<string, unknown>;
};

const MODEL_REGISTRY: Record<string, ModelConfig> = {
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
export const getDynamicModel = (modelId: ModelId) => {
  const config = MODEL_REGISTRY[modelId];

  if (!config) return defaultModel;

  // TODO: once subscription status is available from DB, we can decide whether to allow/deny models.
  // For now, always return a real chat model so callers can safely use `.invoke(...)`.
  return createModel(modelId, config);
};
