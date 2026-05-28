"use client";

import type { ChatStatus, UIMessage } from "ai";
import { MessageRenderer } from "@/components/custom/message-renderer";
import { ChatScrollButton } from "@/components/chat/chat-scroll-button";
import { useChatScrollController } from "@/components/chat/hooks/use-chat-scroll-controller";

export function ChatMessageList({ messages, status }: { messages: UIMessage[]; status: ChatStatus }) {
  const { scrollRef, onScroll, showScrollButton, scrollToBottom } = useChatScrollController({
    messages,
    status,
  });

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full min-h-0 touch-pan-y overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-3 py-5 pb-24 sm:px-4">
          <MessageRenderer messages={messages} status={status} />
        </div>
      </div>
      <ChatScrollButton show={showScrollButton} onClick={() => scrollToBottom("smooth")} />
    </div>
  );
}
