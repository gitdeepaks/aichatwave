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

/**
 * One client per model, per process.
 *
 * Phase L item 4: this constructed a new provider client on every request.
 * Each one parses options, builds a fetch wrapper and — for the OpenAI and
 * Anthropic SDKs — sets up its own connection handling, all of it on the path
 * of the token the user is waiting for, and all of it discarded when the turn
 * ended. The clients are stateless with respect to a turn: the model id, the
 * options and the API key are fixed by the registry and the environment, and
 * everything that varies per call — messages, tools, the abort signal — is
 * passed to `invoke` rather than to the constructor.
 *
 * Keyed by model id alone for that reason. When Phase N adds user-supplied
 * keys this cache stops being correct as written, and that is deliberate: a
 * BYOK client is per-key, so the key becomes part of the identity or it does
 * not go in here at all.
 *
 * **On `globalThis`** for the reason `server/observability/metrics.ts`
 * documents: Next builds route handlers and server components into separate
 * module graphs, so a module-level `Map` is instantiated twice in one process
 * and half the requests would miss a cache that looked full.
 */
declare global {
  // `var` rather than `let`: it is the only declaration that augments `globalThis`.
  var __aichatwaveModelClients: Map<ModelId, DynamicChatModel> | undefined;
}

function modelClients(): Map<ModelId, DynamicChatModel> {
  globalThis.__aichatwaveModelClients ??= new Map<ModelId, DynamicChatModel>();
  return globalThis.__aichatwaveModelClients;
}

export const getDynamicModel = (modelId: ModelId): DynamicChatModel => {
  // Before the cache, always. Availability is a property of the environment,
  // and a cached client must never be what decides whether a model is offered.
  assertModelAvailable(modelId);

  const clients = modelClients();
  const existing = clients.get(modelId);
  if (existing !== undefined) return existing;

  const created = createModel(modelId, MODEL_REGISTRY[modelId]);
  clients.set(modelId, created);
  return created;
};

/** Test seam: drops the cached clients so a test can change the environment. */
export function resetModelClients(): void {
  modelClients().clear();
}
