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
 * delegate to the billing service. They take no user id: the Clerk session is
 * the only source of truth for who is asking.
 */

export async function isCustomerHaveSubscription(): Promise<boolean> {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) return false;
  return hasActiveSubscription(sessionUserId);
}

export async function getCustomerMeters(): Promise<CustomerUsageMeter | null> {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) {
    throw new AppError("UNAUTHORIZED", "You must be signed in to view usage.");
  }
  return getCustomerUsageMeter(sessionUserId);
}
