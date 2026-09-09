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
import { appUrl, env, polarServer } from "@/lib/env";
import { isPolarAuthFailure, polarErrorFacts } from "@/server/billing/polar-error";
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

  const email = params.email.trim();

  try {
    const checkout = await polarClient.checkouts.create({
      products: [env.POLAR_PRODUCT_ID],
      externalCustomerId: params.userId,
      // Omitted rather than sent empty: Polar rejects `customer_email: ""` as a
      // validation error, which would turn "we could not read the address" into
      // an unexplained failed checkout.
      ...(email.length > 0 ? { customerEmail: email } : {}),
      successUrl: `${appUrl()}/success?checkout_id={CHECKOUT_ID}`,
    });

    log.info("billing.checkout_created", { userId: params.userId });
    return { url: checkout.url };
  } catch (error) {
    throw toBillingError(error, {
      event: "billing.checkout_failed",
      userId: params.userId,
      userMessage: "Could not start checkout. Please try again.",
      log,
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
    throw toBillingError(error, {
      event: "billing.portal_failed",
      userId: params.userId,
      userMessage: "Could not open the billing portal. Please try again.",
      log,
    });
  }
}

/**
 * Logs a Polar failure with the upstream status and error code as structured
 * fields, then converts it to a typed error.
 *
 * A revoked token and a malformed request both surfaced as an identical opaque
 * 502 before this, so an outage that was really "the credential is dead" looked
 * like an application bug. `SERVICE_UNAVAILABLE` is used for credential
 * failures because they are an operator problem: no amount of user retrying
 * fixes them.
 */
function toBillingError(
  error: unknown,
  params: { event: string; userId: string; userMessage: string; log: Logger },
): AppError {
  const facts = polarErrorFacts(error);
  const authFailure = isPolarAuthFailure(error);

  params.log.error(
    params.event,
    {
      userId: params.userId,
      polarServer,
      upstreamStatus: facts.upstreamStatus,
      upstreamCode: facts.upstreamCode,
      upstreamDetail: facts.upstreamDetail,
      // The most common root cause is a token from the other Polar environment,
      // so record which one this process is talking to alongside the failure.
      credentialFailure: authFailure,
    },
    error,
  );

  if (authFailure) {
    return new AppError(
      "SERVICE_UNAVAILABLE",
      "Billing is temporarily unavailable. Our team has been notified.",
      { cause: error },
    );
  }

  return new AppError("UPSTREAM_ERROR", params.userMessage, { cause: error });
}
