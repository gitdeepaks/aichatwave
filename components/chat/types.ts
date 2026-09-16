import type { ChatRequestOptions, ChatStatus } from "ai";
import type { KeyboardEventHandler, RefObject } from "react";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

export type SendChatMessage = (
  message: PromptInputMessage,
  options?: ChatRequestOptions,
) => void | Promise<void>;

/**
 * What the composer shows about the current turn.
 *
 * `rate-limited` and `quota-exceeded` are separate variants rather than an
 * `error` with a different label, because they call for different controls: a
 * countdown and a retry for the first, an upgrade button and no retry for the
 * second — retrying a spent allowance only produces the same 429.
 */
export type ChatVisibleStatus =
  | { kind: "idle" }
  | { kind: "uploading"; label: string }
  | { kind: "stopped"; label: string }
  | { kind: "submitted"; label: string }
  | { kind: "streaming"; label: string }
  | { kind: "tool-running"; label: string; toolName: string }
  | { kind: "rate-limited"; label: string; retryLabel: string; retryAfterSeconds: number | null }
  | { kind: "quota-exceeded"; label: string; upgradeLabel: string }
  | { kind: "error"; label: string; retryLabel: string };

export type ChatComposerController = {
  input: string;
  setInput: (input: string) => void;
  canSubmit: boolean;
  /** True while an answer is in flight and there is something to stop. */
  canStop: boolean;
  isBusy: boolean;
  /** True while the turn's attachments are being uploaded, before it is sent. */
  isUploading: boolean;
  handleSubmit: (message: PromptInputMessage) => void | Promise<void>;
  handleStop: () => void;
  handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  handleTranscriptionChange: (text: string) => void;
  /** Pre-flight check for picked files, so a rejection is immediate. */
  validateFiles: (files: File[]) => boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

export type ChatComposerSubmitArgs = {
  message: PromptInputMessage;
  status: ChatStatus;
};
