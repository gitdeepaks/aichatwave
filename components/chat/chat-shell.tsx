"use client";

import { useChat } from "@ai-sdk/react";
import type { ChatStatus, UIMessage } from "ai";
import type { StoredMessage } from "@langchain/core/messages";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { useChatViewport } from "@/components/chat/hooks/use-chat-viewport";
import { useChatVisibleStatus } from "@/components/chat/hooks/use-chat-visible-status";
import { convertLangChainToUI } from "@/lib/converters";
import { useChatStore } from "@/store/chat-store";

export function ChatShell({ oldMessages }: { oldMessages: StoredMessage[] }) {
  const { chatInstance } = useChatStore();
  const { messages, setMessages, sendMessage, status, error } = useChat({ chat: chatInstance });
  const [isHydrated, setIsHydrated] = useState(false);
  const [starterPrompt, setStarterPrompt] = useState("");

  useChatViewport();

  useEffect(() => {
    const convertedOldMessages = convertLangChainToUI(oldMessages);
    setMessages(convertedOldMessages);
  }, [oldMessages, setMessages]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!error) return;
    toast.error(error.message || "Something went wrong", {
      id: "chat-send-error",
    });
  }, [error]);

  const liveMessages: UIMessage[] = isHydrated ? messages : [];
  const liveStatus: ChatStatus = status;
  const visibleStatus = useChatVisibleStatus({ status: liveStatus, error, messages: liveMessages });
  const isEmpty = liveMessages.length === 0 && messages.length === 0;

  if (isEmpty) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-4 sm:px-6">
        <main className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col items-center justify-end rounded-[2rem] border border-white/10 bg-zinc-950/25 px-4 pb-0 shadow-[0_24px_90px_-46px_rgba(0,0,0,0.85)] backdrop-blur-sm md:justify-center md:px-8">
          <ChatEmptyState onPromptSelect={setStarterPrompt} />
          <div className="w-full">
            <ChatComposer
              sendMessage={sendMessage}
              status={liveStatus}
              visibleStatus={visibleStatus}
              initialInput={starterPrompt}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-3 sm:px-6 sm:pt-4">
      <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col items-center overflow-hidden rounded-t-[2rem] border-x border-t border-white/10 bg-zinc-950/20 shadow-[0_24px_90px_-46px_rgba(0,0,0,0.85)] backdrop-blur-sm">
        <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <ChatMessageList messages={liveMessages} status={liveStatus} />
          <ChatComposer
            sendMessage={sendMessage}
            status={liveStatus}
            visibleStatus={visibleStatus}
            initialInput={starterPrompt}
          />
        </section>
      </main>
    </div>
  );
}
