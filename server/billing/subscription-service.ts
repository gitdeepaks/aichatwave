/**
 * Subscription service: plan checks, model access enforcement, and usage
 * ingestion against Polar. Route handlers and the agent graph never talk to
 * the Polar client directly.
 */

import { polarClient } from "@/lib/polar-client";
import { isModelAccessible, type ModelId } from "@/lib/ai/model-registry";
import { AppError } from "@/server/lib/app-error";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

export type CustomerUsageMeter = {
  createdAt: Date;
  creditedUnits: number;
  consumedUnits: number;
  balance: number;
};

/**
 * Checks for an active Polar subscription. Lookup failures are treated as
 * "no subscription" (fail closed) and logged with context.
 */
export async function hasActiveSubscription(
  userId: string,
  log: Logger = rootLogger,
): Promise<boolean> {
  try {
    const data = await polarClient.subscriptions.list({
      externalCustomerId: userId,
      active: true,
    });
    return data.result.items.length > 0;
  } catch (error) {
    log.error("billing.subscription_check_failed", { userId }, error);
    return false;
  }
}

/** Throws a typed 403 when the user's plan does not include the model. */
export async function assertModelAccess(
  userId: string,
  modelId: ModelId,
  log: Logger = rootLogger,
): Promise<void> {
  const subscribed = await hasActiveSubscription(userId, log);

  if (!isModelAccessible(modelId, subscribed)) {
    throw new AppError(
      "MODEL_ACCESS_DENIED",
      "You don't have access to this model. Please upgrade to a Pro subscription.",
    );
  }
}

export async function getCustomerUsageMeter(userId: string): Promise<CustomerUsageMeter | null> {
  const meters = await polarClient.customerMeters.list({
    externalCustomerId: userId,
  });

  const first = meters.result.items[0];
  if (!first) return null;

  return {
    createdAt: first.createdAt,
    creditedUnits: first.creditedUnits,
    consumedUnits: first.consumedUnits,
    balance: first.balance,
  };
}

export type ModelUsageEvent = {
  userId: string | undefined;
  model: ModelId;
  requestId: string;
  llmCallId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

/** Ingests token usage to Polar; failures are non-fatal and logged with context. */
export async function ingestModelUsage(
  event: ModelUsageEvent,
  log: Logger = rootLogger,
): Promise<void> {
  const externalCustomerId = event.userId?.trim();
  if (!externalCustomerId) return;

  const metadata: Record<string, string | number> = {
    model: event.model,
    request_id: event.requestId,
    llm_call_id: event.llmCallId,
    input_tokens: event.inputTokens,
    output_tokens: event.outputTokens,
    total_tokens: event.totalTokens,
  };

  try {
    await polarClient.events.ingest({
      events: [
        {
          name: "llm_tokens",
          externalCustomerId,
          metadata,
        },
      ],
    });
  } catch (error) {
    log.error(
      "billing.usage_ingest_failed",
      { userId: externalCustomerId, model: event.model, requestId: event.requestId },
      error,
    );
  }
}
