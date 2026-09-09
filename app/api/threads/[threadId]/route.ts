import { z } from "zod";
import { updateThreadRequestSchema, type ThreadResponse } from "@/lib/api/contracts";
import { toThreadDto } from "@/server/api/dto";
import { deleteThread, renameThread, requireOwnedThread } from "@/server/chat/thread-service";
import {
  createRouteHandler,
  jsonResponse,
  noBody,
  noContentResponse,
  noQuery,
} from "@/server/lib/route-handler";

const threadParamsSchema = z.object({ threadId: z.string().min(1) });

export const GET = createRouteHandler({
  name: "GET /api/threads/[threadId]",
  params: threadParamsSchema,
  query: noQuery,
  body: noBody,
  handler: async ({ userId, params }) => {
    const thread = await requireOwnedThread({ threadId: params.threadId, userId });
    const response: ThreadResponse = { thread: toThreadDto(thread) };
    return jsonResponse(response);
  },
});

export const PATCH = createRouteHandler({
  name: "PATCH /api/threads/[threadId]",
  params: threadParamsSchema,
  query: noQuery,
  body: updateThreadRequestSchema,
  handler: async ({ userId, params, body, log }) => {
    const updated = await renameThread({
      threadId: params.threadId,
      userId,
      patch: body,
      log,
    });

    const response: ThreadResponse = { thread: toThreadDto(updated) };
    return jsonResponse(response);
  },
});

export const DELETE = createRouteHandler({
  name: "DELETE /api/threads/[threadId]",
  params: threadParamsSchema,
  query: noQuery,
  body: noBody,
  handler: async ({ userId, params, log }) => {
    await deleteThread({ threadId: params.threadId, userId, log });
    return noContentResponse();
  },
});
