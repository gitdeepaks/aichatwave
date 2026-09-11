/**
 * Monthly usage quota.
 *
 * Usage has always been ingested to Polar and never checked — `ingestModelUsage`
 * wrote a meter nothing read, so an account could spend an unbounded amount of
 * provider money and the only signal was the bill. This is the check.
 *
 * It reserves before the model runs rather than counting after it. Counting
 * after leaves the last turn free, and under concurrency leaves as many free
 * turns as there are in-flight requests; reserving first means the allowance is
 * spent the moment it is committed to, and the reservation is given back if the
 * turn fails before any provider call.
 */

import {
  planLimits,
  quotaSnapshot,
  secondsUntil,
  usagePeriodFor,
  type PlanId,
  type QuotaSnapshot,
} from "@/lib/billing/plan-policy";
import {
  readUsage,
  recordTokens,
  releaseMessage,
  reserveMessage,
} from "@/server/db/usage-repository";
import { AppError } from "@/server/lib/app-error";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

/**
 * A spent reservation, returned so the caller can give it back.
 *
 * Carries its own `periodStart` rather than recomputing one at release time:
 * a turn that straddles midnight on the first of the month would otherwise
 * credit the new period for a message charged to the old one.
 */
export type QuotaReservation = {
  userId: string;
  periodStart: Date;
  snapshot: QuotaSnapshot;
};

/**
 * Reserves one message against the user's monthly allowance.
 *
 * Throws `QUOTA_EXCEEDED` — a 429 distinct from `RATE_LIMITED`, because the
 * remedy is different: slowing down does not help, upgrading or waiting for the
 * period to reset does. `Retry-After` is the seconds until the reset, which is
 * honest even when it is three weeks.
 */
export async function assertWithinQuota(params: {
  userId: string;
  planId: PlanId;
  now?: Date;
  log?: Logger;
}): Promise<QuotaReservation> {
  const now = params.now ?? new Date();
  const log = params.log ?? rootLogger;
  const period = usagePeriodFor(now);
  const limit = planLimits(params.planId).monthlyMessages;

  const { reserved, messages } = await reserveMessage({
    userId: params.userId,
    periodStart: period.start,
    limit,
  });

  const snapshot = quotaSnapshot({ planId: params.planId, used: messages, now });

  if (!reserved) {
    log.warn("quota.exceeded", {
      userId: params.userId,
      planId: params.planId,
      used: messages,
      limit,
    });

    throw new AppError("QUOTA_EXCEEDED", quotaMessage(params.planId, snapshot), {
      retryAfterSeconds: secondsUntil(snapshot.resetAt, now),
    });
  }

  return { userId: params.userId, periodStart: period.start, snapshot };
}

/**
 * Returns a reservation to the allowance. Never throws — a failed refund must
 * not replace the error the caller is already reporting.
 */
export async function refundQuota(
  reservation: QuotaReservation,
  log: Logger = rootLogger,
): Promise<void> {
  try {
    await releaseMessage({
      userId: reservation.userId,
      periodStart: reservation.periodStart,
    });
  } catch (error) {
    log.error("quota.refund_failed", { userId: reservation.userId }, error);
  }
}

/** Records provider-reported tokens against the period. Never throws. */
export async function recordQuotaTokens(
  params: {
    userId: string;
    periodStart: Date;
    inputTokens: number;
    outputTokens: number;
  },
  log: Logger = rootLogger,
): Promise<void> {
  try {
    await recordTokens(params);
  } catch (error) {
    log.error("quota.token_record_failed", { userId: params.userId }, error);
  }
}

/** Read-only view for the profile page and the composer's remaining-messages hint. */
export async function getQuotaSnapshot(params: {
  userId: string;
  planId: PlanId;
  now?: Date;
}): Promise<QuotaSnapshot> {
  const now = params.now ?? new Date();
  const period = usagePeriodFor(now);
  const usage = await readUsage({ userId: params.userId, periodStart: period.start });
  return quotaSnapshot({ planId: params.planId, used: usage.messages, now });
}

function quotaMessage(planId: PlanId, snapshot: QuotaSnapshot): string {
  const resets = snapshot.resetAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return planId === "pro"
    ? `You've used all ${snapshot.limit} messages included this month. Your allowance resets on ${resets}.`
    : `You've used all ${snapshot.limit} free messages this month. Upgrade to Pro for more, or wait until ${resets}.`;
}
