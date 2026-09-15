import { z } from "zod";
import { ACCOUNT_DELETION_CONFIRMATION } from "@/lib/account-deletion";
import { deleteAccount } from "@/server/account/account-deletion-service";
import { createRouteHandler, jsonResponse, noParams, noQuery } from "@/server/lib/route-handler";

const bodySchema = z.object({ confirmation: z.literal(ACCOUNT_DELETION_CONFIRMATION) });

export const POST = createRouteHandler({
  name: "POST /api/account/delete",
  params: noParams,
  query: noQuery,
  body: bodySchema,
  handler: async ({ userId, log }) => {
    await deleteAccount({ userId, log });
    return jsonResponse({ status: "deleted" });
  },
});
