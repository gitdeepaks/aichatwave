import { z } from "zod";
import { deleteMemory } from "@/server/memory/memory-service";
import { createRouteHandler, noBody, noContentResponse, noQuery } from "@/server/lib/route-handler";

const memoryParamsSchema = z.object({ memoryId: z.string().min(1) });

export const DELETE = createRouteHandler({
  name: "DELETE /api/memories/[memoryId]",
  params: memoryParamsSchema,
  query: noQuery,
  body: noBody,
  handler: async ({ userId, params, log }) => {
    await deleteMemory({ userId, memoryId: params.memoryId, log });
    return noContentResponse();
  },
});
