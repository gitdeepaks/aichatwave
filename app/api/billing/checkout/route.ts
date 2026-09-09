import { currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import { createProCheckout } from "@/server/billing/checkout-service";
import { createRouteHandler, jsonResponse, noParams, noQuery } from "@/server/lib/route-handler";

const checkoutResponseSchema = z.object({ url: z.url() });
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

/**
 * Starts a Pro checkout. The product is chosen here, on the server, from
 * validated env — the client cannot ask to be billed for something else.
 */
export const POST = createRouteHandler({
  name: "POST /api/billing/checkout",
  params: noParams,
  query: noQuery,
  body: z.undefined(),
  handler: async ({ userId, log }) => {
    const clerkUser = await currentUser();
    const email = clerkUser?.primaryEmailAddress?.emailAddress ?? "";

    const session = await createProCheckout({ userId, email, log });
    return jsonResponse(checkoutResponseSchema.parse(session));
  },
});
