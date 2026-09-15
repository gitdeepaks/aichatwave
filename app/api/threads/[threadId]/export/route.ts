import { z } from "zod";
import { createConversationExport } from "@/server/chat/conversation-export-service";
import { createRouteHandler, noBody } from "@/server/lib/route-handler";

const paramsSchema = z.object({ threadId: z.string().min(1) });
const querySchema = z.object({ format: z.enum(["json", "markdown"]) });

export const GET = createRouteHandler({
  name: "GET /api/threads/[threadId]/export",
  params: paramsSchema,
  query: querySchema,
  body: noBody,
  handler: ({ userId, params, query, log }) =>
    createConversationExport({ userId, threadId: params.threadId, format: query.format, log }),
});
