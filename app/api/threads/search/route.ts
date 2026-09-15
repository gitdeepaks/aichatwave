import { messageSearchQuerySchema, type MessageSearchResponse } from "@/lib/api/contracts";
import { toMessageSearchResultDto } from "@/server/api/dto";
import { searchMessages } from "@/server/chat/thread-service";
import { createRouteHandler, jsonResponse, noBody, noParams } from "@/server/lib/route-handler";

export const GET = createRouteHandler({
  name: "GET /api/threads/search",
  params: noParams,
  query: messageSearchQuerySchema,
  body: noBody,
  handler: async ({ userId, query, log }) => {
    const page = await searchMessages({
      userId,
      query: query.q,
      cursor: query.cursor,
      limit: query.limit,
      log,
    });

    const response: MessageSearchResponse = {
      results: page.items.map(toMessageSearchResultDto),
      nextCursor: page.nextCursor,
    };

    return jsonResponse(response);
  },
});
