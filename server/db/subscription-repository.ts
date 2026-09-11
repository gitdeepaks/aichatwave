/**
 * The local mirror of Polar subscription state.
 *
 * Phase A created the `subscription` table and nothing ever wrote to it, so
 * every plan check was a Polar API call on the chat hot path — vendor latency
 * and a vendor rate limit in front of every message, failing closed whenever
 * Polar hiccuped. This repository is the write side of that mirror; the Polar
 * webhook fills it and `server/billing/subscription-service.ts` reads it.
 *
 * Polar remains the source of truth. This is a cache with a durable invalidation
 * channel (the webhook), plus a one-time cold read recorded on
 * `user.billing_synced_at`.
 */

import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema/auth-schema";
import { subscription, SUBSCRIPTION_STATUSES } from "@/db/schema/billing-schema";

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * The statuses that grant access.
 *
 * `past_due` deliberately still grants it: the card failed, Polar is retrying,
 * and cutting a paying customer off mid-dunning costs more goodwill than the
 * few days of service is worth. `canceled` does not appear here — a
 * cancel-at-period-end subscription stays `active` until the period actually
 * ends, so the period check below is what ends access, not the status.
 */
export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"] as const;

export type SubscriptionRecord = {
  id: string;
  userId: string;
  polarSubscriptionId: string;
  polarProductId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: Date | null;
  updatedAt: Date;
};

export type UpsertSubscriptionInput = {
  userId: string;
  polarSubscriptionId: string;
  polarProductId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  /** When the subscription is set to lapse, or null when it is not. */
  cancelAtPeriodEnd: Date | null;
};

/**
 * Writes one subscription, keyed on Polar's id.
 *
 * Webhook delivery is at-least-once and out of order, so this has to be
 * idempotent, and it is: the conflict target is the unique Polar id, and every
 * mutable column is overwritten from the payload. The `user_id` is overwritten
 * too — a subscription transferred between customers is rare but real, and a
 * stale owner would leave a second user holding Pro.
 */
export async function upsertSubscription(input: UpsertSubscriptionInput): Promise<void> {
  await db
    .insert(subscription)
    .values({
      id: input.polarSubscriptionId,
      userId: input.userId,
      polarSubscriptionId: input.polarSubscriptionId,
      polarProductId: input.polarProductId,
      status: input.status,
      currentPeriodEnd: input.currentPeriodEnd,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd,
    })
    .onConflictDoUpdate({
      target: subscription.polarSubscriptionId,
      set: {
        userId: input.userId,
        polarProductId: input.polarProductId,
        status: input.status,
        currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.cancelAtPeriodEnd,
        updatedAt: new Date(),
      },
    });
}

/**
 * The user's access-granting subscription, if they have one.
 *
 * Expiry is part of the query rather than a check on the result: a row left
 * `active` by a webhook that never arrived still stops granting access once its
 * period is past, so a missed `subscription.revoked` degrades to "access ends
 * on schedule" instead of "Pro forever".
 */
export async function findActiveSubscription(params: {
  userId: string;
  now: Date;
}): Promise<SubscriptionRecord | null> {
  const rows = await db
    .select({
      id: subscription.id,
      userId: subscription.userId,
      polarSubscriptionId: subscription.polarSubscriptionId,
      polarProductId: subscription.polarProductId,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      updatedAt: subscription.updatedAt,
    })
    .from(subscription)
    .where(
      and(
        eq(subscription.userId, params.userId),
        inArray(subscription.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
        or(isNull(subscription.currentPeriodEnd), gt(subscription.currentPeriodEnd, params.now)),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Whether this user's mirror has ever been reconciled against Polar directly.
 *
 * Without this flag, "no active subscription row" is ambiguous — it could mean
 * free, or it could mean the webhook has not landed yet — and the only safe
 * reading would be to ask Polar on every request, which is the call this whole
 * phase exists to remove.
 */
export async function readBillingSyncedAt(userId: string): Promise<Date | null> {
  const rows = await db
    .select({ billingSyncedAt: user.billingSyncedAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return rows[0]?.billingSyncedAt ?? null;
}

/** Stamps the mirror as reconciled. No-op when the user row does not exist yet. */
export async function markBillingSynced(params: { userId: string; at: Date }): Promise<void> {
  await db.update(user).set({ billingSyncedAt: params.at }).where(eq(user.id, params.userId));
}
