import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { isModelId, type ModelId } from "@/app/api/chat/model-registry";

type ChatRequestBody = {
  threadId?: string;
  selectedModel?: ModelId;
};

function isChatRequestBody(body: unknown): body is ChatRequestBody {
  if (typeof body !== "object" || body === null) return false;

  const value = body as Record<string, unknown>;
  const hasValidThreadId = value.threadId === undefined || typeof value.threadId === "string";
  const hasValidModel = value.selectedModel === undefined || isModelId(value.selectedModel);

  return hasValidThreadId && hasValidModel;
}

export interface ChatStoreState {
  chatInstance: Chat<UIMessage>;
  selectedModel: ModelId;
  setSelectedModel: (modelId: ModelId) => void;
}

function createChat() {
  const fallbackThreadId = uuidv4().toString();

  const transport = new DefaultChatTransport<UIMessage>({
    api: "/api/chat",
    prepareSendMessagesRequest: ({ messages, body }) => {
      // DefaultChatTransport provides the full UI message history.
      // Our backend expects `{ threadId, messageContent }`, so we extract the last user text.
      const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
      const messageContent = lastUserMessage?.parts.find((p) => p.type === "text")?.text ?? "";
      const requestBody = isChatRequestBody(body) ? body : undefined;
      const requestThreadId = requestBody?.threadId;
      const threadId = requestThreadId && requestThreadId.length > 0 ? requestThreadId : fallbackThreadId;

      return {
        body: {
          messageContent,
          threadId,
          selectedModel: requestBody?.selectedModel,
        },
      };
    },
  });
  return new Chat<UIMessage>({
    transport: transport,
  });
}

export const useChatStore = create<ChatStoreState>((set) => ({
  chatInstance: createChat(),
  selectedModel: "gpt-5-mini",
  setSelectedModel: (modelId: ModelId) => set({ selectedModel: modelId }),
}));
