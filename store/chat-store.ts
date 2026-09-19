"use client";

import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { create } from "zustand";
import { z } from "zod";
import { chatRequestSchema } from "@/app/api/chat/schema";
import { DEFAULT_MODEL_ID, MODEL_IDS, type ModelId } from "@/lib/ai/model-registry";
import type { AppUIMessage } from "@/lib/chat/ui-message";

/**
 * What the composer attaches to `sendMessage`. Parsed rather than guarded: the
 * AI SDK types this body as an opaque bag, and reading fields out of it
 * unchecked is exactly the `Record<string, unknown>` cast this project forbids.
 */
const composerBodySchema = z.object({
  selectedModel: z.enum(MODEL_IDS).optional(),
  attachmentIds: z.array(z.string().min(1)).optional(),
  regenerate: z.boolean().optional(),
});

/**
 * The wire body, taken from the route's own schema — the input side, since the
 * server fills in the defaults. A field renamed in `app/api/chat/schema.ts`
 * is a compile error here.
 */
type ChatRequestBody = z.input<typeof chatRequestSchema>;

export interface ChatStoreState {
  selectedModel: ModelId;
  setSelectedModel: (modelId: ModelId) => void;
}

/**
 * `DEFAULT_MODEL_ID` rather than a literal. The store used to open on
 * `gpt-5-mini` while the server's fallback was `gpt-5-nano`, so a request that
 * omitted the model and one that sent the store's default resolved to
 * different models — and the cost shown in the UI was for whichever the client
 * happened to name.
 */
export const useChatStore = create<ChatStoreState>((set) => ({
  selectedModel: DEFAULT_MODEL_ID,
  setSelectedModel: (modelId: ModelId) => set({ selectedModel: modelId }),
}));

/**
 * One `Chat` per thread, cached for the tab's lifetime.
 *
 * There used to be a single module-level instance shared by every thread, with
 * a module-level fallback id reused for the whole session, and `ChatShell`
 * overwrote its `messages` on every navigation. Three consequences followed
 * from that, and all three were reachable by clicking around quickly:
 * switching threads mid-stream delivered the running answer into whichever
 * conversation was on screen; the `setMessages` on arrival raced the stream and
 * could erase tokens already received; and two threads opened in one session
 * shared a chat id, so a resume request for one could reconnect to the other.
 *
 * Keying the instance by thread id removes the shared mutable state entirely.
 * The chat's `id` is the thread id, which also makes the SDK's default
 * reconnect URL — `{api}/{chatId}/stream` — address the right conversation
 * without any further wiring.
 */
const chats = new Map<string, Chat<AppUIMessage>>();

/**
 * How many threads keep a live instance. Bounded because each one retains its
 * whole message list; a long session that visits fifty conversations should
 * not hold fifty histories in memory. Eviction is least-recently-created,
 * which for this cache is also least-recently-visited: revisiting a thread
 * that was evicted simply rebuilds it from the server-rendered window.
 */
const MAX_CACHED_CHATS = 8;

function createChat(threadId: string, initialMessages: AppUIMessage[]): Chat<AppUIMessage> {
  const transport = new DefaultChatTransport<AppUIMessage>({
    api: "/api/chat",
    prepareSendMessagesRequest: ({ messages, body }) => {
      // The transport hands over the full UI history; this backend takes the
      // newest user turn and reads the rest from its own tables.
      const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
      const messageContent =
        lastUserMessage?.parts.find((part) => part.type === "text")?.text ?? "";

      const parsed = composerBodySchema.safeParse(body);
      const composerBody = parsed.success ? parsed.data : {};

      const requestBody: ChatRequestBody = {
        messageContent,
        // Closed over, not read from the body: the thread this chat belongs to
        // is fixed when the instance is created, so a stale id in a request
        // body cannot redirect a turn into another conversation.
        threadId,
        ...(composerBody.selectedModel === undefined
          ? {}
          : { selectedModel: composerBody.selectedModel }),
        ...(composerBody.attachmentIds === undefined
          ? {}
          : { attachmentIds: composerBody.attachmentIds }),
        ...(composerBody.regenerate === undefined ? {} : { regenerate: composerBody.regenerate }),
      };

      return { body: requestBody };
    },
  });

  return new Chat<AppUIMessage>({
    id: threadId,
    messages: initialMessages,
    transport,
  });
}

/**
 * The instance for a thread, created on first use.
 *
 * `initialMessages` seeds a *new* instance only. An existing one is returned
 * untouched, which is what keeps a reload — or a navigation back to a thread
 * whose answer is still streaming — from overwriting live state with the
 * server's older snapshot.
 */
export function getChatForThread(
  threadId: string,
  initialMessages: AppUIMessage[],
): Chat<AppUIMessage> {
  const existing = chats.get(threadId);
  if (existing) return existing;

  const chat = createChat(threadId, initialMessages);
  chats.set(threadId, chat);

  while (chats.size > MAX_CACHED_CHATS) {
    const oldest = chats.keys().next();
    if (oldest.done || oldest.value === threadId) break;
    chats.delete(oldest.value);
  }

  return chat;
}

/** Drops a thread's instance, so a deleted conversation leaves nothing behind. */
export function forgetChatForThread(threadId: string): void {
  chats.delete(threadId);
}
