"use client";

import type { ChatStatus } from "ai";
import type { ModelId } from "@/lib/ai/model-registry";
import type { AppUIMessage } from "@/lib/chat/ui-message";
import { LoaderCircle } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { MessageRenderer } from "@/components/custom/message-renderer";
import { ChatScrollButton } from "@/components/chat/chat-scroll-button";
import { useChatScrollController } from "@/components/chat/hooks/use-chat-scroll-controller";
import { usePrefersReducedMotion } from "@/components/chat/hooks/use-prefers-reduced-motion";

export function ChatMessageList({
  messages,
  status,
  hasEarlierMessages,
  isLoadingEarlier,
  onLoadEarlier,
  onRegenerate,
}: {
  messages: AppUIMessage[];
  status: ChatStatus;
  hasEarlierMessages: boolean;
  isLoadingEarlier: boolean;
  onLoadEarlier: () => Promise<void>;
  onRegenerate?: (modelId?: ModelId) => void;
}) {
  const { scrollRef, onScroll, showScrollButton, scrollToBottom } = useChatScrollController({
    messages,
    status,
  });
  const prefersReducedMotion = usePrefersReducedMotion();
  const buttonScrollBehavior: ScrollBehavior = prefersReducedMotion ? "auto" : "smooth";
  const pendingAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const isStreaming = status === "submitted" || status === "streaming";

  useLayoutEffect(() => {
    const element = scrollRef.current;
    const anchor = pendingAnchorRef.current;
    if (!element || !anchor || isLoadingEarlier) return;

    element.scrollTop = anchor.scrollTop + element.scrollHeight - anchor.scrollHeight;
    pendingAnchorRef.current = null;
  }, [isLoadingEarlier, messages, scrollRef]);

  const handleLoadEarlier = async () => {
    const element = scrollRef.current;
    if (!element) return;
    pendingAnchorRef.current = { scrollHeight: element.scrollHeight, scrollTop: element.scrollTop };
    await onLoadEarlier();
  };

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full min-h-0 touch-pan-y overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable] [mask-image:linear-gradient(to_bottom,transparent_0,#000_18px,#000_calc(100%-18px),transparent_100%)]"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-3 py-6 pb-[calc(var(--chat-composer-height,6rem)+1.5rem)] sm:px-5">
          {hasEarlierMessages ? (
            <button
              type="button"
              disabled={isLoadingEarlier || isStreaming}
              onClick={() => void handleLoadEarlier()}
              className="mx-auto flex h-8 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isLoadingEarlier && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
              {isLoadingEarlier ? "Loading history" : "Load earlier messages"}
            </button>
          ) : null}
          <MessageRenderer
            messages={messages}
            status={status}
            {...(onRegenerate === undefined ? {} : { onRegenerate })}
          />
        </div>
      </div>
      <ChatScrollButton
        show={showScrollButton}
        onClick={() => scrollToBottom(buttonScrollBehavior)}
      />
    </div>
  );
}
