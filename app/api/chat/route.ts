import { chatRequestSchema } from "@/app/api/chat/schema";
import { streamChat } from "@/server/chat/chat-service";
import { createRouteHandler, noParams, noQuery } from "@/server/lib/route-handler";

export const POST = createRouteHandler({
  name: "POST /api/chat",
  params: noParams,
  query: noQuery,
  body: chatRequestSchema,
  handler: async ({ userId, body, requestId }) => {
    return streamChat({
      userId,
      threadId: body.threadId,
      messageContent: body.messageContent,
      selectedModel: body.selectedModel,
      requestId,
    });
  },
});
