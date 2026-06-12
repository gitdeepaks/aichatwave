"use server";

import { getSessionUserId } from "@/server/auth/session";
import {
  getCustomerUsageMeter,
  hasActiveSubscription,
  type CustomerUsageMeter,
} from "@/server/billing/subscription-service";
import { AppError } from "@/server/lib/app-error";

/**
 * Server actions are the client-facing boundary; they resolve the session and
 * delegate to the billing service. The `_userId` parameters are kept for call
 * compatibility but never trusted — the session is the source of truth.
 */

export async function isCustomerHaveSubscription(_userId: string): Promise<boolean> {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return false;
  return hasActiveSubscription(sessionUserId);
}

export async function getCustomerMeters(_userId: string): Promise<CustomerUsageMeter | null> {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) {
    throw new AppError("UNAUTHORIZED", "You must be signed in to view usage.");
  }
  return getCustomerUsageMeter(sessionUserId);
}
