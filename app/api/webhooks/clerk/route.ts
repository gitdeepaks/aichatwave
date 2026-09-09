/**
 * Clerk → database sync.
 *
 * Verified by signature, never by session, so this route is listed as public in
 * `proxy.ts`. It keeps the local `user` mirror current; it is deliberately not
 * the only thing that creates rows, because webhook delivery is asynchronous
 * and a new user can write before `user.created` lands. See
 * `server/auth/user-service.ts` for the just-in-time path that covers that gap.
 */

import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { ensurePolarCustomer } from "@/server/billing/checkout-service";
import { deleteUser, resolveName, upsertUser } from "@/server/auth/user-service";
import { logger } from "@/server/lib/logger";
import { resolveRequestId } from "@/server/lib/request-id";

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = resolveRequestId(request.headers);
  const log = logger.child({ requestId, route: "POST /api/webhooks/clerk" });

  if (!env.CLERK_WEBHOOK_SIGNING_SECRET) {
    log.error("webhook.signing_secret_missing");
    return new Response("Webhook signing secret is not configured.", { status: 503 });
  }

  let event;
  try {
    event = await verifyWebhook(request);
  } catch (error) {
    log.warn("webhook.verification_failed", {}, error);
    return new Response("Verification failed", { status: 400 });
  }

  try {
    if (event.type === "user.created" || event.type === "user.updated") {
      const {
        id,
        email_addresses,
        primary_email_address_id,
        first_name,
        last_name,
        username,
        image_url,
      } = event.data;

      const primaryEmail =
        email_addresses.find((address) => address.id === primary_email_address_id) ??
        email_addresses[0];
      const email = primaryEmail?.email_address ?? `${id}@placeholder.invalid`;
      const name = resolveName({
        firstName: first_name,
        lastName: last_name,
        username,
        email,
      });

      await upsertUser({
        id,
        name,
        email,
        emailVerified: primaryEmail?.verification?.status === "verified",
        image: image_url.length > 0 ? image_url : null,
      });
      log.info("webhook.user_synced", { userId: id, event: event.type });

      if (event.type === "user.created") {
        await ensurePolarCustomer({ userId: id, email, name, log });
      }
    }

    if (event.type === "user.deleted") {
      const { id } = event.data;
      if (id) {
        // Threads, messages, and subscriptions cascade from the user row.
        await deleteUser(id);
        log.info("webhook.user_deleted", { userId: id });
      }
    }
  } catch (error) {
    // 5xx tells Svix to retry; the handlers above are idempotent.
    log.error("webhook.handler_failed", { event: event.type }, error);
    return new Response("Handler failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
