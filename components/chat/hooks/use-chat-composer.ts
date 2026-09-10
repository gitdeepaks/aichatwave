"use client";

import type { ChatStatus } from "ai";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useChatStore } from "@/store/chat-store";
import type { ChatComposerController, SendChatMessage } from "@/components/chat/types";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

export function useChatComposer({
  sendMessage,
  status,
  initialInput = "",
  initialInputVersion = 0,
}: {
  sendMessage?: SendChatMessage;
  status: ChatStatus;
  initialInput?: string;
  initialInputVersion?: number;
}): ChatComposerController {
  const { selectedModel } = useChatStore();
  const router = useRouter();
  const params = useParams();
  const threadIdParam = params["thread_id"];
  const threadIdFromUrl = typeof threadIdParam === "string" ? threadIdParam : threadIdParam?.[0];
  const [generatedThreadId] = useState(() => uuidv4());
  const [input, setInput] = useState(initialInput);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const finalThreadId = threadIdFromUrl ?? generatedThreadId;
  const isBusy = status === "submitted" || status === "streaming";
  const canSubmit = input.trim().length > 0 && !isBusy;

  useEffect(() => {
    setInput(initialInput);
  }, [initialInput, initialInputVersion]);

  const handleSubmit = useCallback<ChatComposerController["handleSubmit"]>(
    async (message: PromptInputMessage) => {
      const text = message.text.trim();
      if (!text || isBusy || !sendMessage) return;

      await sendMessage(
        { ...message, text },
        {
          body: {
            threadId: finalThreadId,
            selectedModel,
          },
        },
      );

      setInput("");

      if (!threadIdFromUrl) {
        router.push(`/chat/${finalThreadId}`);
      }
    },
    [finalThreadId, isBusy, router, selectedModel, sendMessage, threadIdFromUrl],
  );

  const handleKeyDown = useCallback<ChatComposerController["handleKeyDown"]>((event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }, []);

  const handleTranscriptionChange = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setInput((current) =>
      current.trim().length === 0 ? trimmed : `${current.trimEnd()} ${trimmed}`,
    );
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, []);

  return useMemo(
    () => ({
      input,
      setInput,
      canSubmit,
      isBusy,
      handleSubmit,
      handleKeyDown,
      handleTranscriptionChange,
      textareaRef,
    }),
    [canSubmit, handleKeyDown, handleSubmit, handleTranscriptionChange, input, isBusy],
  );
}
