"use client";

import { useChat } from "@ai-sdk/react";
import type { ChatStatus, UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { useChatViewport } from "@/components/chat/hooks/use-chat-viewport";
import { useChatVisibleStatus } from "@/components/chat/hooks/use-chat-visible-status";
import { threadsApi } from "@/lib/api/client";
import type { MessageDto } from "@/lib/api/contracts";
import { convertMessageDtosToUI, mergeEarlierMessages } from "@/lib/converters";
import { useChatStore } from "@/store/chat-store";

export function ChatShell({
  threadId,
  initialMessages,
  initialNextCursor,
}: {
  threadId?: string;
  initialMessages: MessageDto[];
  initialNextCursor: string | null;
}) {
  const { chatInstance } = useChatStore();
  const { messages, setMessages, sendMessage, status, error, regenerate, clearError } = useChat({
    chat: chatInstance,
  });
  const [isHydrated, setIsHydrated] = useState(false);
  const [nextCursor, setNextCursor] = useState(initialNextCursor ?? null);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [starterPrompt, setStarterPrompt] = useState({ text: "", version: 0 });
  const composerRef = useRef<HTMLDivElement | null>(null);
  const loadingEarlierRef = useRef(false);

  useChatViewport(composerRef);

  // The server already rendered this window of history. `messages` lives in a
  // module-level chat instance that may still hold another thread's turns, so
  // it cannot be trusted until hydration — but the server's own payload can,
  // and rendering it on the first paint is what keeps an existing conversation
  // from flashing the empty state on reload.
  const serverMessages = useMemo(() => convertMessageDtosToUI(initialMessages), [initialMessages]);

  useEffect(() => {
    setMessages(serverMessages);
    setNextCursor(initialNextCursor);
  }, [serverMessages, initialNextCursor, setMessages]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!error) return;
    toast.error(error.message || "Something went wrong", {
      id: "chat-send-error",
    });
  }, [error]);

  const liveMessages: UIMessage[] = isHydrated ? messages : serverMessages;
  const liveStatus: ChatStatus = status;
  const visibleStatus = useChatVisibleStatus({ status: liveStatus, error, messages: liveMessages });
  const isEmpty = liveMessages.length === 0 && messages.length === 0;

  const handleRetry = useCallback(() => {
    clearError();
    void regenerate();
  }, [clearError, regenerate]);

  const handlePromptSelect = useCallback((prompt: string) => {
    setStarterPrompt((current) => ({ text: prompt, version: current.version + 1 }));
  }, []);

  const loadEarlier = useCallback(async () => {
    if (
      !threadId ||
      !nextCursor ||
      loadingEarlierRef.current ||
      status === "submitted" ||
      status === "streaming"
    )
      return;

    loadingEarlierRef.current = true;
    setIsLoadingEarlier(true);
    try {
      const page = await threadsApi.messages(threadId, { cursor: nextCursor, limit: 50 });
      const earlier = convertMessageDtosToUI(page.messages);
      setMessages((current) => mergeEarlierMessages(current, earlier));
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      toast.error(
        loadError instanceof Error ? loadError.message : "Could not load earlier messages",
      );
    } finally {
      loadingEarlierRef.current = false;
      setIsLoadingEarlier(false);
    }
  }, [nextCursor, setMessages, status, threadId]);

  if (isEmpty) {
    return (
      <div className="flex h-dvh min-h-0 flex-1 flex-col overflow-hidden px-2 py-3 [height:var(--chat-viewport-height,100dvh)] sm:px-6 sm:py-5">
        <main className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col items-center justify-end overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950/35 px-4 pb-0 shadow-[0_28px_120px_-52px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl md:justify-center md:px-8">
          <div
            className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-orange-200/45 to-transparent"
            aria-hidden
          />
          <ChatEmptyState onPromptSelect={handlePromptSelect} />
          <div className="w-full">
            <ChatComposer
              sendMessage={sendMessage}
              status={liveStatus}
              visibleStatus={visibleStatus}
              initialInput={starterPrompt.text}
              initialInputVersion={starterPrompt.version}
              containerRef={composerRef}
              onRetry={handleRetry}
            />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-1 flex-col overflow-hidden px-2 pt-2 [height:var(--chat-viewport-height,100dvh)] sm:px-5 sm:pt-4">
      <main className="relative mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col items-center overflow-hidden rounded-t-[2rem] border-x border-t border-white/10 bg-zinc-950/30 shadow-[0_30px_120px_-54px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl">
        <div
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-orange-200/40 to-transparent"
          aria-hidden
        />
        <section className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <ChatMessageList
            messages={liveMessages}
            status={liveStatus}
            hasEarlierMessages={nextCursor !== null}
            isLoadingEarlier={isLoadingEarlier}
            onLoadEarlier={loadEarlier}
          />
          <ChatComposer
            sendMessage={sendMessage}
            status={liveStatus}
            visibleStatus={visibleStatus}
            initialInput={starterPrompt.text}
            initialInputVersion={starterPrompt.version}
            containerRef={composerRef}
            onRetry={handleRetry}
          />
        </section>
      </main>
    </div>
  );
}
