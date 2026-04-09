import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";

export interface ChatStoreState {
  chatInstance: Chat<UIMessage>;
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
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
      const requestBody = (body ?? {}) as { threadId?: string };
      const threadId = requestBody.threadId ?? fallbackThreadId;

      return {
        body: {
          messageContent,
          threadId,
          selectedModel: body?.selectedModel,
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
  setSelectedModel: (modelId: string) => set({ selectedModel: modelId }),
}));
