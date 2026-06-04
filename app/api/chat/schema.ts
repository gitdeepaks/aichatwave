import { z } from "zod";
import { DEFAULT_MODEL_ID, isModelId, type ModelId } from "@/app/api/chat/model";

export const chatRequestErrorCode = "INVALID_CHAT_REQUEST";

export type ChatValidationErrorResponse = {
  error: {
    code: typeof chatRequestErrorCode;
    message: string;
    issues: Array<{
      path: string;
      message: string;
    }>;
  };
};

export const chatRequestSchema = z
  .object({
    threadId: z.string().trim().min(1),
    messageContent: z.string().trim().min(1).max(20_000),
    selectedModel: z.unknown().optional(),
  })
  .superRefine((value, context) => {
    if (value.selectedModel !== undefined && !isModelId(value.selectedModel)) {
      context.addIssue({
        code: "custom",
        path: ["selectedModel"],
        message: "Selected model is not supported.",
      });
    }
  })
  .transform((value) => ({
    threadId: value.threadId,
    messageContent: value.messageContent,
    selectedModel: isModelId(value.selectedModel) ? value.selectedModel : DEFAULT_MODEL_ID,
  }));

export type ChatRequest = {
  threadId: string;
  messageContent: string;
  selectedModel: ModelId;
};

export function formatChatValidationError(error: z.ZodError): ChatValidationErrorResponse {
  return {
    error: {
      code: chatRequestErrorCode,
      message: "Invalid chat request.",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
  };
}
