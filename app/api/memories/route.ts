import type { MemoryListResponse } from "@/lib/api/contracts";
import { toMemoryDto } from "@/server/api/dto";
import { listMemories } from "@/server/memory/memory-service";
import {
  createRouteHandler,
  jsonResponse,
  noBody,
  noParams,
  noQuery,
} from "@/server/lib/route-handler";

export const GET = createRouteHandler({
  name: "GET /api/memories",
  params: noParams,
  query: noQuery,
  body: noBody,
  handler: async ({ userId }) => {
    const memories = await listMemories(userId);
    const response: MemoryListResponse = { memories: memories.map(toMemoryDto) };
    return jsonResponse(response);
  },
});
