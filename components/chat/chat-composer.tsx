"use client";

import { ArrowUp, FileText, Loader2, Plus, Square, X } from "lucide-react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { SpeechInput } from "@/components/ai-elements/speech-input";
import { ChatStatusBar } from "@/components/chat/chat-status-bar";
import { useChatComposer } from "@/components/chat/hooks/use-chat-composer";
import type { ChatVisibleStatus, SendChatMessage } from "@/components/chat/types";
import {
  ATTACHMENT_ACCEPT,
  attachmentKindOf,
  formatBytes,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/ai/attachments";
import type { ChatStatus } from "ai";
import type { RefObject } from "react";
import { toast } from "sonner";

export function ChatComposer({
  sendMessage,
  stop,
  status,
  visibleStatus,
  threadId,
  isNewThread,
  initialInput,
  initialInputVersion,
  containerRef,
  onRetry,
}: {
  sendMessage?: SendChatMessage;
  stop?: () => void | Promise<void>;
  status: ChatStatus;
  visibleStatus: ChatVisibleStatus;
  threadId: string;
  isNewThread: boolean;
  initialInput?: string;
  initialInputVersion?: number;
  containerRef?: RefObject<HTMLDivElement | null>;
  onRetry?: () => void;
}) {
  // Optional props are forwarded only when present: under
  // `exactOptionalPropertyTypes`, passing `undefined` explicitly is not the
  // same as omitting the field.
  const {
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
    textareaRef,
  } = useChatComposer({
    status,
    threadId,
    isNewThread,
    ...(sendMessage === undefined ? {} : { sendMessage }),
    ...(stop === undefined ? {} : { stop }),
    ...(initialInput === undefined ? {} : { initialInput }),
    ...(initialInputVersion === undefined ? {} : { initialInputVersion }),
  });

  return (
    <div
      ref={containerRef}
      className="shrink-0 border-t border-hairline bg-surface-sunken/45 px-3 pt-3 pb-[calc(var(--chat-safe-bottom,env(safe-area-inset-bottom))+0.75rem)] shadow-glow-up backdrop-blur-glass-heavy sm:px-5"
    >
      <ChatStatusBar status={visibleStatus} {...(onRetry === undefined ? {} : { onRetry })} />
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center">
        <PromptInput
          className="w-full rounded-5xl border border-hairline bg-surface-raised/90 shadow-elevation-lg inset-shadow-highlight backdrop-blur-glass transition-[border-color,box-shadow,background-color,transform] focus-within:-translate-y-0.5 focus-within:border-brand-text-strong/45 focus-within:bg-surface-raised/95 focus-within:ring-2 focus-within:ring-brand-strong/15 motion-reduce:transition-none motion-reduce:focus-within:translate-y-0"
          onSubmit={handleSubmit}
          accept={ATTACHMENT_ACCEPT}
          multiple
          maxFiles={MAX_ATTACHMENTS_PER_MESSAGE}
          // The larger of the two ceilings; the per-kind limit is applied in
          // `useChatComposer`, which knows which model is selected.
          maxFileSize={Math.max(MAX_ATTACHMENT_BYTES.image, MAX_ATTACHMENT_BYTES.pdf)}
          onError={(error) => toast.error(error.message)}
        >
          <AttachmentTray />
          <PromptInputBody className="flex w-full items-end gap-1 p-2">
            <AddAttachmentButton disabled={isBusy || isUploading} />

            <div className="flex h-full min-w-0 flex-1 items-center justify-center">
              <PromptInputTextarea
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                ref={textareaRef}
                value={input}
                placeholder="Message AIChatWave, paste code, or dictate an idea..."
                className="flex max-h-48 min-h-11 w-full resize-none items-center justify-center border-none bg-transparent py-3 text-base leading-relaxed text-fg-strong placeholder:text-fg-subtle focus:ring-0 focus-visible:ring-0 sm:text-lg"
              />
            </div>

            <div className="mb-0.5 flex shrink-0 items-center gap-1.5">
              <SpeechInput
                className="h-10 w-10 shrink-0 bg-transparent text-fg-soft hover:bg-glass-strong hover:text-fg-bright"
                onTranscriptionChange={handleTranscriptionChange}
                size="icon-lg"
                variant="ghost"
                aria-label="Speech input"
              />

              {/*
                Stop replaces send while an answer is in flight, rather than
                sitting beside it. There is exactly one useful action at that
                moment, and a disabled send button next to a stop button is two
                controls competing to say the same thing.
              */}
              {canStop ? (
                <button
                  type="button"
                  onClick={handleStop}
                  aria-label="Stop generating"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hairline-strong bg-glass-strong text-fg-strong transition-all hover:scale-105 hover:bg-glass-heavy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/70 motion-reduce:transition-none motion-reduce:hover:scale-100"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!canSubmit}
                  aria-label="Send message"
                  className="brand-action-vivid flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand-foreground shadow-glow-md inset-shadow-highlight-strong transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/70 disabled:scale-100 disabled:bg-none disabled:bg-glass-solid disabled:text-fg-subtle disabled:opacity-100 disabled:shadow-none motion-reduce:transition-none motion-reduce:hover:scale-100"
                >
                  {isUploading || isBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp />
                  )}
                </button>
              )}
            </div>
          </PromptInputBody>
        </PromptInput>
      </div>
    </div>
  );
}

/**
 * Send, enabled by text *or* by an attachment.
 *
 * The attachment count only exists inside `PromptInput`'s context, so this is
 * a child component rather than a prop. Requiring text was wrong: "what is in
 * this image?" is a message whose content is the picture, the request schema
 * accepts it, and the button was the only thing refusing.
 */
function SendButton({
  hasText,
  blocked,
  busy,
}: {
  hasText: boolean;
  blocked: boolean;
  busy: boolean;
}) {
  const attachments = usePromptInputAttachments();
  const canSend = (hasText || attachments.files.length > 0) && !blocked;

  return (
    <button
      type="submit"
      disabled={!canSend}
      aria-label="Send message"
      className="brand-action-vivid flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand-foreground shadow-glow-md inset-shadow-highlight-strong transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/70 disabled:scale-100 disabled:bg-none disabled:bg-glass-solid disabled:text-fg-subtle disabled:opacity-100 disabled:shadow-none motion-reduce:transition-none motion-reduce:hover:scale-100"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp />}
    </button>
  );
}

/**
 * The `+` control. It used to carry an `aria-label` and no handler — a button
 * that announced itself to a screen reader and then did nothing at all.
 */
function AddAttachmentButton({ disabled }: { disabled: boolean }) {
  const attachments = usePromptInputAttachments();

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => attachments.openFileDialog()}
      aria-label="Add an image or PDF"
      className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-transparent text-fg-muted transition-colors hover:border-hairline hover:bg-glass-strong hover:text-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50 disabled:opacity-40 motion-reduce:transition-none"
    >
      <Plus size={24} strokeWidth={1.5} />
    </button>
  );
}

/** The picked files, above the textarea, each removable before sending. */
function AttachmentTray() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2 px-3 pt-3" aria-label="Attachments">
      {attachments.files.map((file) => {
        const isImage = attachmentKindOf(file.mediaType) === "image";

        return (
          <li
            key={file.id}
            className="group/chip relative flex items-center gap-2 rounded-xl border border-hairline bg-glass py-1.5 pl-1.5 pr-7 text-xs text-fg"
          >
            {isImage && file.url ? (
              // A local blob URL for a file the user just picked; it is
              // revoked by `PromptInput` when the chip is removed.
              // eslint-disable-next-line @next/next/no-img-element -- blob URL, never optimizable
              <img src={file.url} alt="" className="h-8 w-8 rounded-lg object-cover" aria-hidden />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-glass-strong">
                <FileText className="h-4 w-4 text-fg-soft" aria-hidden />
              </span>
            )}
            <span className="max-w-40 truncate">{file.filename ?? "Attachment"}</span>
            <button
              type="button"
              onClick={() => attachments.remove(file.id)}
              aria-label={`Remove ${file.filename ?? "attachment"}`}
              className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-glass-strong hover:text-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50"
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export { formatBytes };
