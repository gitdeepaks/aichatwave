"use client";

import { ArrowUp, Loader2, Plus } from "lucide-react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { SpeechInput } from "@/components/ai-elements/speech-input";
import { ChatStatusBar } from "@/components/chat/chat-status-bar";
import { useChatComposer } from "@/components/chat/hooks/use-chat-composer";
import type { ChatVisibleStatus, SendChatMessage } from "@/components/chat/types";
import type { ChatStatus } from "ai";
import type { RefObject } from "react";

export function ChatComposer({
  sendMessage,
  status,
  visibleStatus,
  initialInput,
  initialInputVersion,
  containerRef,
  onRetry,
}: {
  sendMessage?: SendChatMessage;
  status: ChatStatus;
  visibleStatus: ChatVisibleStatus;
  initialInput?: string;
  initialInputVersion?: number;
  containerRef?: RefObject<HTMLDivElement | null>;
  onRetry?: () => void;
}) {
  const {
    input,
    setInput,
    canSubmit,
    isBusy,
    handleSubmit,
    handleKeyDown,
    handleTranscriptionChange,
    textareaRef,
  } = useChatComposer({ sendMessage, status, initialInput, initialInputVersion });

  return (
    <div
      ref={containerRef}
      className="shrink-0 border-t border-white/10 bg-zinc-950/45 px-3 pt-3 pb-[calc(var(--chat-safe-bottom,env(safe-area-inset-bottom))+0.75rem)] shadow-[0_-24px_70px_-58px_rgba(251,146,60,0.8)] backdrop-blur-2xl sm:px-5"
    >
      <ChatStatusBar status={visibleStatus} onRetry={onRetry} />
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center">
        <PromptInput
          className="w-full rounded-[30px] border border-white/10 bg-zinc-900/90 shadow-[0_22px_70px_-34px_rgba(0,0,0,1),0_0_0_1px_rgba(255,255,255,0.025),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition-[border-color,box-shadow,background-color,transform] focus-within:-translate-y-0.5 focus-within:border-orange-200/45 focus-within:bg-zinc-900/95 focus-within:ring-2 focus-within:ring-orange-500/15 motion-reduce:transition-none motion-reduce:focus-within:translate-y-0"
          onSubmit={handleSubmit}
        >
          <PromptInputBody className="flex w-full items-end gap-1 p-2">
            <button
              type="button"
              aria-label="Add attachment"
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-transparent text-zinc-400 transition-colors hover:border-white/10 hover:bg-white/8 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/50 motion-reduce:transition-none"
            >
              <Plus size={24} strokeWidth={1.5} />
            </button>

            <div className="flex h-full min-w-0 flex-1 items-center justify-center">
              <PromptInputTextarea
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                ref={textareaRef}
                value={input}
                placeholder="Message AIChatWave, paste code, or dictate an idea..."
                className="flex max-h-48 min-h-11 w-full resize-none items-center justify-center border-none bg-transparent py-3 text-[16px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:ring-0 focus-visible:ring-0 sm:text-[17px]"
              />
            </div>

            <div className="mb-0.5 flex shrink-0 items-center gap-1.5">
              <SpeechInput
                className="h-10 w-10 shrink-0 bg-transparent text-zinc-300 hover:bg-white/8 hover:text-white"
                onTranscriptionChange={handleTranscriptionChange}
                size="icon-lg"
                variant="ghost"
                aria-label="Speech input"
              />

              <button
                type="submit"
                disabled={!canSubmit}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-200 via-orange-300 to-amber-400 text-zinc-950 shadow-[0_14px_34px_-16px_rgba(251,146,60,0.95),inset_0_1px_0_rgba(255,255,255,0.55)] transition-all hover:scale-105 hover:from-orange-100 hover:to-orange-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/70 disabled:scale-100 disabled:bg-none disabled:bg-white/20 disabled:text-zinc-500 disabled:opacity-100 disabled:shadow-none motion-reduce:transition-none motion-reduce:hover:scale-100"
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp />}
              </button>
            </div>
          </PromptInputBody>
        </PromptInput>
      </div>
    </div>
  );
}
