/**
 * Polar → database sync for subscription state.
 *
 * This is what makes the local mirror trustworthy, and therefore what removes
 * the per-message Polar API call from the chat hot path. Without it the mirror
 * would only ever be filled by the cold-cache read and would go stale the
 * moment a plan changed.
 *
 * Verified by signature, never by session — like the Clerk webhook, and for
 * the same reason it is not built on `createRouteHandler`: there is no user to
 * resolve, and the cross-origin guard that factory applies would reject a call
 * that is legitimately cross-origin.
 */

import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { z } from "zod";
import { env } from "@/lib/env";
import { SUBSCRIPTION_STATUSES } from "@/db/schema/billing-schema";
import { markBillingSynced, upsertSubscription } from "@/server/db/subscription-repository";
import { logger } from "@/server/lib/logger";
import { resolveRequestId } from "@/server/lib/request-id";

/**
 * The events that change whether a user has access.
 *
 * `subscription.updated` alone would very nearly do — Polar sends it alongside
 * most of the others — but relying on that would make access depend on an
 * undocumented emission order. Listing them is explicit and costs nothing:
 * every handler here is the same idempotent upsert.
 */
const SUBSCRIPTION_EVENT_TYPES = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.past_due",
  "subscription.revoked",
]);

/**
 * The fields this app needs from a Polar subscription payload, parsed rather
 * than read off the SDK's union.
 *
 * The SDK types `WebhookSubscription*Payload` as a 37-member union whose
 * members differ in ways this app does not care about, and types `status` as an
 * open enum — a value the SDK has never seen still arrives as a string. Parsing
 * to the shape the `subscription` table actually stores is both narrower and
 * safer than narrowing the union: an unrecognized status fails the parse here
 * instead of reaching the column and failing as a database error.
 */
const polarSubscriptionSchema = z.object({
  id: z.string().min(1),
  status: z.enum(SUBSCRIPTION_STATUSES),
  productId: z.string().min(1),
  currentPeriodEnd: z.coerce.date().nullable().catch(null),
  cancelAtPeriodEnd: z.boolean().catch(false),
  endsAt: z.coerce.date().nullable().catch(null),
  customer: z.object({
    /** The Clerk user id, set by `ensurePolarCustomer` at sign-up. */
    externalId: z.string().min(1).nullable(),
  }),
});

export async function POST(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request.headers);
  const log = logger.child({ requestId, route: "POST /api/webhooks/polar" });

  // Bound to a local before the `await` below: narrowing a property of an
  // imported object does not survive the async boundary, and the project
  // forbids the non-null assertion that would otherwise paper over it.
  const webhookSecret = env.POLAR_WEBHOOK_SECRET;
  if (webhookSecret === undefined) {
    log.error("webhook.polar_secret_missing");
    return new Response("Webhook secret is not configured.", { status: 503 });
  }

  const body = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  let event;
  try {
    event = validateEvent(body, headers, webhookSecret);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      log.warn("webhook.polar_verification_failed", {}, error);
      return new Response("Verification failed", { status: 403 });
    }
    log.error("webhook.polar_parse_failed", {}, error);
    return new Response("Malformed payload", { status: 400 });
  }

  if (!SUBSCRIPTION_EVENT_TYPES.has(event.type)) {
    // 200 rather than 4xx: the event was delivered correctly and this endpoint
    // simply does not act on it. A 4xx would make Polar retry it forever.
    log.debug("webhook.polar_event_ignored", { event: event.type });
    return new Response("Ignored", { status: 200 });
  }

  const parsed = polarSubscriptionSchema.safeParse(event.data);
  if (!parsed.success) {
    log.error("webhook.polar_payload_unrecognized", {
      event: event.type,
      issues: parsed.error.issues.map((issue) => issue.path.join(".")).join(","),
    });
    // The payload will not become parseable on a retry, so this is terminal.
    return new Response("Unrecognized payload", { status: 200 });
  }

  const subscription = parsed.data;
  const userId = subscription.customer.externalId;

  if (userId === null) {
    // A subscription bought outside this app's checkout has no Clerk id
    // attached. Nothing to mirror; the cold-cache read will pick it up if the
    // customer is ever linked.
    log.warn("webhook.polar_customer_unlinked", {
      event: event.type,
      polarSubscriptionId: subscription.id,
    });
    return new Response("No external customer", { status: 200 });
  }

  try {
    await upsertSubscription({
      userId,
      polarSubscriptionId: subscription.id,
      polarProductId: subscription.productId,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
      // Polar reports the intent as a boolean and the date separately; the
      // column holds the date the lapse takes effect, so the two are combined
      // here rather than storing a flag the reader would have to interpret.
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
        ? (subscription.endsAt ?? subscription.currentPeriodEnd)
        : null,
    });

    // Proof the mirror is current for this user, which is what lets the plan
    // resolver serve them locally from here on without asking Polar.
    await markBillingSynced({ userId, at: new Date() });

    log.info("webhook.polar_subscription_synced", {
      event: event.type,
      userId,
      polarSubscriptionId: subscription.id,
      status: subscription.status,
    });
  } catch (error) {
    // 5xx tells Polar to retry; the upsert above is idempotent.
    log.error("webhook.polar_handler_failed", { event: event.type, userId }, error);
    return new Response("Handler failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
