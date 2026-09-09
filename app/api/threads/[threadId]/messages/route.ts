import { z } from "zod";
import { paginationQuerySchema, type MessageListResponse } from "@/lib/api/contracts";
import { toMessageDto } from "@/server/api/dto";
import { listThreadMessages } from "@/server/chat/thread-service";
import { createRouteHandler, jsonResponse, noBody } from "@/server/lib/route-handler";

const threadParamsSchema = z.object({ threadId: z.string().min(1) });

export const GET = createRouteHandler({
  name: "GET /api/threads/[threadId]/messages",
  params: threadParamsSchema,
  query: paginationQuerySchema,
  body: noBody,
  handler: async ({ userId, params, query, log }) => {
    const page = await listThreadMessages({
      threadId: params.threadId,
      userId,
      cursor: query.cursor,
      limit: query.limit,
      log,
    });

    const response: MessageListResponse = {
      messages: page.items.map(toMessageDto),
      nextCursor: page.nextCursor,
    };

    return jsonResponse(response);
  },
});
