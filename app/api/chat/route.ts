import { chatRequestWithContentSchema } from "@/app/api/chat/schema";
import { streamChat } from "@/server/chat/chat-service";
import { clientIpFromHeaders } from "@/server/security/client-ip";
import { createRouteHandler, noParams, noQuery } from "@/server/lib/route-handler";

export const POST = createRouteHandler({
  name: "POST /api/chat",
  params: noParams,
  query: noQuery,
  body: chatRequestWithContentSchema,
  handler: async ({ userId, body, requestId, request }) => {
    return streamChat({
      userId,
      threadId: body.threadId,
      messageContent: body.messageContent,
      selectedModel: body.selectedModel,
      attachmentIds: body.attachmentIds,
      regenerate: body.regenerate,
      requestId,
      // Resolved here, at the HTTP edge, rather than inside the service: the
      // service takes a value, not a `Request`, so the limiter stays testable
      // and nothing downstream has to know which proxy header to trust.
      clientIp: clientIpFromHeaders(request.headers),
    });
  },
});
