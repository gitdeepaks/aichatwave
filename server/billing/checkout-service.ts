/**
 * Polar checkout and customer-portal sessions.
 *
 * These two flows used to be client-side calls provided by the
 * `@polar-sh/better-auth` plugin (`authClient.checkout(...)`,
 * `authClient.customer.portal()`). That plugin is gone with Better Auth, so the
 * flows are server-owned now: the client asks this app for a URL and is
 * redirected. That is the better shape anyway — the plan and product id are
 * decided on the server, where the user cannot choose them.
 */

import { polarClient } from "@/lib/polar-client";
import { appUrl, env } from "@/lib/env";
import { AppError } from "@/server/lib/app-error";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

export type CheckoutSession = { url: string };

/**
 * Ensures Polar knows this user, keyed by the Clerk user id as
 * `externalCustomerId`. Better Auth's plugin did this on sign-up via
 * `createCustomerOnSignUp`; without it, checkout and usage ingestion would
 * reference a customer that does not exist yet.
 */
export async function ensurePolarCustomer(params: {
  userId: string;
  email: string;
  name: string;
  log?: Logger;
}): Promise<void> {
  const log = params.log ?? rootLogger;

  try {
    await polarClient.customers.getExternal({ externalId: params.userId });
    return;
  } catch {
    // Not found — fall through and create.
  }

  try {
    await polarClient.customers.create({
      externalId: params.userId,
      email: params.email,
      name: params.name,
    });
    log.info("billing.customer_created", { userId: params.userId });
  } catch (error) {
    // Non-fatal: a duplicate or transient failure must not block sign-in.
    log.error("billing.customer_create_failed", { userId: params.userId }, error);
  }
}

export async function createProCheckout(params: {
  userId: string;
  email: string;
  log?: Logger;
}): Promise<CheckoutSession> {
  const log = params.log ?? rootLogger;

  try {
    const checkout = await polarClient.checkouts.create({
      products: [env.POLAR_PRODUCT_ID],
      externalCustomerId: params.userId,
      customerEmail: params.email,
      successUrl: `${appUrl()}/success?checkout_id={CHECKOUT_ID}`,
    });

    log.info("billing.checkout_created", { userId: params.userId });
    return { url: checkout.url };
  } catch (error) {
    log.error("billing.checkout_failed", { userId: params.userId }, error);
    throw new AppError("UPSTREAM_ERROR", "Could not start checkout. Please try again.", {
      cause: error,
    });
  }
}

export async function createCustomerPortal(params: {
  userId: string;
  log?: Logger;
}): Promise<CheckoutSession> {
  const log = params.log ?? rootLogger;

  try {
    const session = await polarClient.customerSessions.create({
      externalCustomerId: params.userId,
    });

    return { url: session.customerPortalUrl };
  } catch (error) {
    log.error("billing.portal_failed", { userId: params.userId }, error);
    throw new AppError("UPSTREAM_ERROR", "Could not open the billing portal. Please try again.", {
      cause: error,
    });
  }
}
