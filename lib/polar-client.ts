/**
 * Polar SDK client.
 *
 * Polar used to be wired in through the `@polar-sh/better-auth` plugin, which
 * meant the billing client lived inside the auth module and checkout/portal
 * were client-side `authClient` calls. Clerk has no such plugin, so the client
 * lives here on its own and billing goes through the app's own API routes.
 */

import { Polar } from "@polar-sh/sdk";
import { env, polarServer } from "@/lib/env";

export const polarClient = new Polar({
  accessToken: env.POLAR_ACCESS_TOKEN,
  server: polarServer,
});
