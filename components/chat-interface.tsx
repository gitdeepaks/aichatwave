"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useState } from "react";
import InputContainer from "./input-container";
import { useChatStore } from "@/store/chat-store";
import { MessageRenderer } from "@/components/custom/message-renderer";
import type { ChatStatus, UIMessage } from "ai";
import type { StoredMessage } from "@langchain/core/messages";
import { convertLangChainToUI } from "@/lib/converters";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { ConversationAutoScroll } from "@/components/ai-elements/conversation-auto-scroll";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

export const ChatInterfaceNew = ({ oldMessages }: { oldMessages: StoredMessage[] }) => {
  const { chatInstance } = useChatStore();

  const { messages, setMessages, sendMessage, status, error } = useChat({
    chat: chatInstance,
  });

  useEffect(() => {
    const convertedOldMessages = convertLangChainToUI(oldMessages);
    setMessages(convertedOldMessages);
  }, [oldMessages, setMessages]);

  useEffect(() => {
    if (!error) return;
    toast.error(error.message || "Something went wrong", {
      id: "chat-send-error",
    });
  }, [error]);

  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Keep initial client render aligned with SSR to avoid hydration mismatch.
  const liveMessages: UIMessage[] = isHydrated ? messages : [];
  const liveStatus: ChatStatus = status;
  return (
    <>
      {liveMessages.length === 0 && messages.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-4 sm:px-6">
          <main className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col items-center justify-end rounded-[2rem] border border-white/10 bg-zinc-950/25 px-4 pb-5 shadow-[0_24px_90px_-46px_rgba(0,0,0,0.85)] backdrop-blur-sm md:justify-center md:px-8 md:pb-8">
            <div className="mb-8 flex w-full max-w-xl flex-col items-center text-center">
              <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-orange-300/15 bg-orange-300/[0.08] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-orange-100/80 shadow-[0_10px_30px_-20px_rgba(251,146,60,0.8)]">
                <Sparkles className="size-3 text-orange-300" aria-hidden />
                AIChatWave
              </div>
              <h1 className="text-balance bg-gradient-to-br from-white via-zinc-100 to-zinc-400 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl">
                What can I help you build?
              </h1>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-zinc-400">
                Code, research, and creative work — with memory that remembers your stack and goals.
              </p>
            </div>
            <InputContainer sendMessage={sendMessage} status={liveStatus} error={error} />
          </main>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-3 sm:px-6 sm:pt-4">
          <main className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col items-center overflow-hidden rounded-t-[2rem] border-x border-t border-white/10 bg-zinc-950/20 shadow-[0_24px_90px_-46px_rgba(0,0,0,0.85)] backdrop-blur-sm">
            <div className="flex min-h-0 w-full flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-hidden">
                <Conversation className="h-full min-h-0 overflow-hidden">
                  <ConversationContent
                    className="pb-7"
                    scrollClassName="h-full min-h-0 touch-pan-y overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]"
                  >
                    <ConversationAutoScroll status={liveStatus} />
                    <MessageRenderer messages={liveMessages} status={liveStatus} />
                  </ConversationContent>
                  <ConversationScrollButton />
                </Conversation>
              </div>
              <div className="shrink-0 border-t border-white/10 bg-zinc-950/35 px-3 pt-4 backdrop-blur-md sm:px-5">
                <InputContainer sendMessage={sendMessage} status={liveStatus} error={error} />
              </div>
            </div>
          </main>
        </div>
      )}
    </>
  );
};
