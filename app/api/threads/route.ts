import {
  createThreadRequestSchema,
  paginationQuerySchema,
  threadListQuerySchema,
  type ThreadListResponse,
  type ThreadResponse,
} from "@/lib/api/contracts";
import { toThreadDto } from "@/server/api/dto";
import { createThread, listThreads } from "@/server/chat/thread-service";
import { createRouteHandler, jsonResponse, noBody, noParams } from "@/server/lib/route-handler";

export const GET = createRouteHandler({
  name: "GET /api/threads",
  params: noParams,
  query: threadListQuerySchema,
  body: noBody,
  handler: async ({ userId, query }) => {
    const page = await listThreads({
      userId,
      cursor: query.cursor,
      limit: query.limit,
      view: query.view,
      pinned: query.pinned,
    });

    const response: ThreadListResponse = {
      threads: page.items.map(toThreadDto),
      nextCursor: page.nextCursor,
    };

    return jsonResponse(response);
  },
});

export const POST = createRouteHandler({
  name: "POST /api/threads",
  params: noParams,
  query: paginationQuerySchema.partial(),
  body: createThreadRequestSchema.optional(),
  handler: async ({ userId, body, log }) => {
    const created = await createThread({
      userId,
      id: body?.id,
      title: body?.title,
      log,
    });

    const response: ThreadResponse = { thread: toThreadDto(created) };
    return jsonResponse(response, 201);
  },
});
