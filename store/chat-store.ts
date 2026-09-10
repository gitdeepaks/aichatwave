import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { chatRequestSchema } from "@/app/api/chat/schema";
import { MODEL_IDS, type ModelId } from "@/lib/ai/model-registry";

/**
 * What the composer attaches to `sendMessage`. Parsed rather than guarded: the
 * AI SDK types this body as an opaque bag, and the old hand-written guard cast
 * it to `Record<string, unknown>` to read two fields out of it.
 */
const composerBodySchema = z.object({
  threadId: z.string().min(1).optional(),
  selectedModel: z.enum(MODEL_IDS).optional(),
});

/**
 * The wire body, taken from the route's own schema — the input side, since the
 * server fills in the model default. A field renamed in `app/api/chat/schema.ts`
 * is a compile error here.
 */
type ChatRequestBody = z.input<typeof chatRequestSchema>;

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

      const parsed = composerBodySchema.safeParse(body);
      const composerBody = parsed.success ? parsed.data : {};

      const requestBody: ChatRequestBody = {
        messageContent,
        threadId: composerBody.threadId ?? fallbackThreadId,
        ...(composerBody.selectedModel === undefined
          ? {}
          : { selectedModel: composerBody.selectedModel }),
      };

      return { body: requestBody };
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
