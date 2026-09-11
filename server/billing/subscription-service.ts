/**
 * Subscription service: plan resolution, model access, and usage ingestion.
 *
 * The plan is resolved from the local `subscription` mirror, not from Polar.
 * It used to be the other way round: `assertModelAccess` called
 * `polarClient.subscriptions.list` on *every single message*, putting vendor
 * latency and a vendor rate limit in front of the model and failing closed —
 * denying a paying user their own plan — whenever Polar was slow. Now:
 *
 *   warm  → one indexed local read, zero Polar calls;
 *   stale → the local answer is served immediately and Polar is reconciled in
 *           the background, so a missed webhook self-heals without costing a
 *           user latency;
 *   cold  → the user has never been reconciled, so Polar is consulted once,
 *           the result is persisted, and every later request is warm.
 *
 * Polar stays the source of truth. The webhook at `app/api/webhooks/polar/`
 * is the invalidation channel; this module is the read path.
 */

import { polarClient } from "@/lib/polar-client";
import { isModelAccessible, type ModelId } from "@/lib/ai/model-registry";
import { planFromSubscription, type PlanId } from "@/lib/billing/plan-policy";
import {
  findActiveSubscription,
  markBillingSynced,
  readBillingSyncedAt,
  upsertSubscription,
  type SubscriptionStatus,
} from "@/server/db/subscription-repository";
import { SUBSCRIPTION_STATUSES } from "@/db/schema/billing-schema";
import { AppError } from "@/server/lib/app-error";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

/**
 * How long a reconciliation is trusted before a background refresh is started.
 *
 * Only a backstop for webhooks that never arrived — an endpoint disabled for a
 * week, a delivery Polar gave up on. Short enough that a missed event is not a
 * month-long free ride; long enough that it is one Polar call per user per day,
 * and never one the user waits for.
 */
const BILLING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type CustomerUsageMeter = {
  createdAt: Date;
  creditedUnits: number;
  consumedUnits: number;
  balance: number;
};

export type PlanResolution = {
  planId: PlanId;
  /** Where the answer came from — asserted by the "zero Polar calls" exit criterion. */
  source: "local" | "polar";
  /** True when the local answer was served but a refresh was started behind it. */
  refreshing: boolean;
};

/**
 * Resolves the user's plan, preferring the local mirror.
 *
 * `refresh` is handed back rather than awaited so the caller decides how to run
 * it — the chat path passes it to `waitUntil`, which is what keeps a stale
 * cache off the turn's critical path.
 */
export async function resolvePlan(
  userId: string,
  log: Logger = rootLogger,
): Promise<{ resolution: PlanResolution; refresh: (() => Promise<void>) | null }> {
  const now = new Date();
  const syncedAt = await readBillingSyncedAt(userId);

  if (syncedAt === null) {
    // Cold: "no local row" cannot be distinguished from "webhook not yet
    // delivered", so this is the one request that pays for a Polar call.
    const planId = await reconcileFromPolar(userId, log);
    return { resolution: { planId, source: "polar", refreshing: false }, refresh: null };
  }

  const active = await findActiveSubscription({ userId, now });
  const planId = planFromSubscription(active !== null);
  const isStale = now.getTime() - syncedAt.getTime() > BILLING_CACHE_TTL_MS;

  return {
    resolution: { planId, source: "local", refreshing: isStale },
    refresh: isStale
      ? async () => {
          await reconcileFromPolar(userId, log);
        }
      : null,
  };
}

/**
 * Pulls this user's subscriptions from Polar and writes them into the mirror.
 *
 * Failures are logged and treated as "no subscription", matching the previous
 * behaviour: it is the conservative reading, and it is reached only on a cold
 * cache or a background refresh, so it can no longer deny a warm paying user.
 * The sync stamp is only written on success, so a failed cold read stays cold
 * and is retried on the next request rather than being cached as "free".
 */
async function reconcileFromPolar(userId: string, log: Logger): Promise<PlanId> {
  try {
    const response = await polarClient.subscriptions.list({ externalCustomerId: userId });
    const now = new Date();
    let active = false;

    for (const item of response.result.items) {
      const status = toSubscriptionStatus(item.status);
      if (status === null) {
        log.warn("billing.subscription_status_unknown", {
          userId,
          polarSubscriptionId: item.id,
          status: String(item.status),
        });
        continue;
      }

      await upsertSubscription({
        userId,
        polarSubscriptionId: item.id,
        polarProductId: item.productId,
        status,
        currentPeriodEnd: item.currentPeriodEnd,
        cancelAtPeriodEnd: item.cancelAtPeriodEnd ? (item.endsAt ?? item.currentPeriodEnd) : null,
      });
    }

    await markBillingSynced({ userId, at: now });
    active = (await findActiveSubscription({ userId, now })) !== null;

    log.info("billing.subscription_reconciled", {
      userId,
      subscriptions: response.result.items.length,
      active,
    });
    return planFromSubscription(active);
  } catch (error) {
    log.error("billing.subscription_check_failed", { userId }, error);
    return "free";
  }
}

/**
 * Polar types `status` as an open enum — a value the SDK has never heard of is
 * still delivered as a string — so it is narrowed against the column's own
 * enum rather than trusted. An unknown status is skipped, not coerced into
 * `active`.
 */
function toSubscriptionStatus(value: string): SubscriptionStatus | null {
  return SUBSCRIPTION_STATUSES.find((status) => status === value) ?? null;
}

/**
 * Whether the user is on a paid plan.
 *
 * Kept as the name the profile page and the header CTA already call through
 * `lib/polar.ts`; it is now a local read like everything else.
 */
export async function hasActiveSubscription(
  userId: string,
  log: Logger = rootLogger,
): Promise<boolean> {
  const { resolution, refresh } = await resolvePlan(userId, log);
  if (refresh !== null) await refresh();
  return resolution.planId === "pro";
}

/** Throws a typed 403 when the user's plan does not include the model. */
export function assertModelAccess(planId: PlanId, modelId: ModelId): void {
  if (isModelAccessible(modelId, planId === "pro")) return;

  throw new AppError(
    "MODEL_ACCESS_DENIED",
    "You don't have access to this model. Please upgrade to a Pro subscription.",
  );
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
