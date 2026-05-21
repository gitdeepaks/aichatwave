"use client";

import { ArrowUp, Loader2, Plus } from "lucide-react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { SpeechInput } from "@/components/ai-elements/speech-input";
import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useParams, useRouter } from "next/navigation";
import { useChatStore } from "@/store/chat-store";
import { toast } from "sonner";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import type { ChatStatus, ChatRequestOptions } from "ai";

type InputContainerProps = {
  sendMessage?: (message: PromptInputMessage, options?: ChatRequestOptions) => void | Promise<void>;
  status?: ChatStatus;
  error?: Error | null;
};

function InputContainer({ sendMessage, status = "ready", error }: InputContainerProps) {
  const { selectedModel } = useChatStore();
  const router = useRouter();
  const params = useParams();
  const finalThreadURLId = params.thread_id as string;
  const [generateId, setGenerateId] = useState(() => uuidv4());
  const finalThreadId = finalThreadURLId ?? generateId;
  const [input, setInput] = useState("");

  useEffect(() => {
    if (!error) return;
    toast.error(error.message || "Something went wrong", {
      id: "chat-send-error",
    });
  }, [error]);

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center pb-4 sm:pb-5">
      <PromptInput
        className="w-full rounded-[28px] border border-white/10 bg-zinc-900/85 shadow-[0_18px_55px_-30px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition-[border-color,box-shadow,background-color] focus-within:border-orange-300/35 focus-within:bg-zinc-900/95 focus-within:ring-2 focus-within:ring-orange-500/15"
        onSubmit={(message) => {
          sendMessage?.(message, {
            body: {
              threadId: finalThreadId,
              selectedModel: selectedModel,
            },
          });

          setInput("");

          if (!finalThreadURLId) {
            router.push(`/chat/${finalThreadId}`);
          }
        }}
      >
        <PromptInputBody className="flex w-full items-end gap-1 p-2">
          <button
            type="button"
            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/8 hover:text-zinc-100"
          >
            <Plus size={24} strokeWidth={1.5} />
          </button>

          <div className="flex h-full min-w-0 flex-1 items-center justify-center">
            <PromptInputTextarea
              onChange={(e) => {
                setInput(e.target.value);
              }}
              value={input}
              placeholder="Ask AIChatWave anything..."
              className="flex max-h-48 min-h-11 w-full resize-none items-center justify-center border-none bg-transparent py-3 text-[16px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:ring-0 focus-visible:ring-0 sm:text-[17px]"
            />
          </div>

          <div className="mb-0.5 flex shrink-0 items-center gap-1.5">
            <SpeechInput
              className="h-10 w-10 shrink-0 bg-transparent text-zinc-300 hover:bg-white/8 hover:text-white"
              onTranscriptionChange={(text) => {}}
              size="icon-lg"
              variant="ghost"
              aria-label="Speech input"
            />

            <button
              type="submit"
              disabled={isBusy || input.trim().length === 0}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-300 text-zinc-950 shadow-[0_12px_30px_-18px_rgba(251,146,60,0.9)] transition-all hover:bg-orange-200 disabled:bg-white/20 disabled:text-zinc-500 disabled:opacity-100 disabled:shadow-none"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp />}
            </button>
          </div>
        </PromptInputBody>
      </PromptInput>
    </div>
  );
}

export default InputContainer;
