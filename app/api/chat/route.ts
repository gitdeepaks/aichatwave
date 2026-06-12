import { chatRequestSchema, chatValidationError } from "@/app/api/chat/schema";
import { requireSessionUserId } from "@/server/auth/session";
import { streamChat } from "@/server/chat/chat-service";
import { AppError, appErrorResponse, isAppError, toAppError } from "@/server/lib/app-error";
import { logger } from "@/server/lib/logger";
import { resolveRequestId } from "@/server/lib/request-id";

async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch (error) {
    throw new AppError("INVALID_JSON", "Request body must be valid JSON.", { cause: error });
  }
}

export const POST = async (req: Request): Promise<Response> => {
  const requestId = resolveRequestId(req.headers);
  const log = logger.child({ requestId, route: "POST /api/chat" });

  try {
    const body = await parseJsonBody(req);

    const parsedBody = chatRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      throw chatValidationError(parsedBody.error);
    }

    const userId = await requireSessionUserId();
    const { threadId, messageContent, selectedModel } = parsedBody.data;

    return await streamChat({ userId, threadId, messageContent, selectedModel, requestId });
  } catch (error) {
    const appError = toAppError(error);
    const level = appError.status >= 500 ? "error" : "warn";
    log[level](
      "chat.request_failed",
      { code: appError.code, status: appError.status },
      isAppError(error) ? error.cause : error,
    );
    return appErrorResponse(appError, requestId);
  }
};
