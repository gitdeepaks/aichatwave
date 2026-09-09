import { z } from "zod";
import { createCustomerPortal } from "@/server/billing/checkout-service";
import { createRouteHandler, jsonResponse, noParams, noQuery } from "@/server/lib/route-handler";

const portalResponseSchema = z.object({ url: z.url() });
export type PortalResponse = z.infer<typeof portalResponseSchema>;

export const POST = createRouteHandler({
  name: "POST /api/billing/portal",
  params: noParams,
  query: noQuery,
  body: z.undefined(),
  handler: async ({ userId, log }) => {
    const session = await createCustomerPortal({ userId, log });
    return jsonResponse(portalResponseSchema.parse(session));
  },
});
