"use client";

import type { ChatStatus } from "ai";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/store/chat-store";
import type { ChatComposerController, SendChatMessage } from "@/components/chat/types";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { THREADS_QUERY_KEY } from "@/lib/query-keys";
import {
  attachmentKindOf,
  MAX_ATTACHMENTS_PER_MESSAGE,
  rejectAttachment,
} from "@/lib/ai/attachments";
import { modelAcceptsAttachmentKind } from "@/lib/ai/model-registry";
import { attachmentsApi } from "@/lib/api/client";
import { toFiles } from "@/lib/chat/attachment-files";
import { chatRoute } from "@/lib/routes";

export function useChatComposer({
  sendMessage,
  stop,
  status,
  threadId,
  isNewThread,
  initialInput = "",
  initialInputVersion = 0,
}: {
  sendMessage?: SendChatMessage;
  stop?: () => void | Promise<void>;
  status: ChatStatus;
  /** The thread this composer posts to. Fixed for the life of the component. */
  threadId: string;
  /** True on the home page, where sending also navigates to the new thread. */
  isNewThread: boolean;
  initialInput?: string;
  initialInputVersion?: number;
}): ChatComposerController {
  const { selectedModel } = useChatStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [input, setInput] = useState(initialInput);
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isBusy = status === "submitted" || status === "streaming";
  const canStop = isBusy && stop !== undefined;

  useEffect(() => {
    setInput(initialInput);
  }, [initialInput, initialInputVersion]);

  /**
   * Refuses a file the selected model cannot read, before it is uploaded.
   *
   * The same policy runs again in the UploadThing route and a third time in
   * the chat service — a client check is a courtesy, not a control — but doing
   * it here is what turns "upload, wait, fail" into an immediate explanation.
   */
  const validateFiles = useCallback(
    (files: File[]): boolean => {
      if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
        toast.error(`You can attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} files.`);
        return false;
      }

      for (const file of files) {
        const rejection = rejectAttachment({
          mediaType: file.type,
          sizeBytes: file.size,
          modelAccepts: (kind) => modelAcceptsAttachmentKind(selectedModel, kind),
        });
        if (rejection !== null) {
          toast.error(rejection.message);
          return false;
        }
      }
      return true;
    },
    [selectedModel],
  );

  /**
   * Uploads the turn's files and returns their attachment ids, or null when
   * anything failed.
   *
   * Null rather than "send what worked": a user who attached three files and
   * asked about all three is not served by an answer that silently saw two.
   */
  const uploadAttachments = useCallback(
    async (sources: PromptInputMessage["files"]): Promise<string[] | null> => {
      if (sources.length === 0) return [];

      setIsUploading(true);
      try {
        // Read back before validating: a file that cannot be read has no size
        // or type to check, and must stop the send rather than be skipped.
        const files = await toFiles(sources);
        if (!validateFiles(files)) return null;

        // Sequential, not parallel. Each body carries the whole file, and four
        // of them at once would put four times the largest allowed upload
        // through one connection for no gain the user can perceive.
        const ids: string[] = [];
        for (const file of files) {
          const uploaded = await attachmentsApi.upload(file);
          ids.push(uploaded.id);
        }
        return ids;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed.");
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [validateFiles],
  );

  const handleSubmit = useCallback<ChatComposerController["handleSubmit"]>(
    async (message: PromptInputMessage) => {
      const text = message.text.trim();
      const files = message.files ?? [];
      if ((!text && files.length === 0) || isBusy || isUploading || !sendMessage) return;

      const attachmentIds = await uploadAttachments(files);
      // A failed upload keeps the composer's contents: `PromptInput` only
      // clears when `onSubmit` resolves, so throwing here is what preserves
      // the text and the file chips for a retry.
      if (attachmentIds === null) {
        throw new Error("Attachments were not uploaded.");
      }

      // Started, not awaited. `sendMessage` resolves when the *stream* ends,
      // so awaiting it here held the composer's contents on screen for the
      // length of the answer and — worse — delayed the navigation below until
      // the answer was already over. Failures are not lost: they surface
      // through `useChat`'s error state, which `ChatShell` reports.
      void sendMessage({ ...message, text }, { body: { selectedModel, attachmentIds } });

      setInput("");

      if (isNewThread) {
        // Immediately, while the first answer is still streaming. Until the URL
        // carries the thread id, a reload lands back on `/` and mints a new one
        // — so the answer being written would have nothing to reconnect to.
        // The chat instance is keyed by this same id, so the navigation is
        // seamless: the stream continues into the very same instance.
        router.push(chatRoute(threadId));
        void queryClient.invalidateQueries({ queryKey: THREADS_QUERY_KEY });
      }
    },
    [
      isBusy,
      isNewThread,
      isUploading,
      queryClient,
      router,
      selectedModel,
      sendMessage,
      threadId,
      uploadAttachments,
    ],
  );

  const handleStop = useCallback(() => {
    if (stop === undefined) return;
    void stop();
  }, [stop]);

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

  // "There is text to send". Whether the turn can be sent *at all* also depends
  // on attachments, which live in `PromptInput`'s context — see `SendButton`.
  const canSubmit = input.trim().length > 0 && !isBusy && !isUploading;

  return useMemo(
    () => ({
      input,
      setInput,
      canSubmit,
      canStop,
      isBusy,
      isUploading,
      handleSubmit,
      handleStop,
      handleKeyDown,
      handleTranscriptionChange,
      validateFiles,
      textareaRef,
    }),
    [
      canStop,
      canSubmit,
      handleKeyDown,
      handleStop,
      handleSubmit,
      handleTranscriptionChange,
      input,
      isBusy,
      isUploading,
      validateFiles,
    ],
  );
}

export { attachmentKindOf };
