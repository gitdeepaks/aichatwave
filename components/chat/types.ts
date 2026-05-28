import type { ChatRequestOptions, ChatStatus } from "ai";
import type { KeyboardEventHandler, RefObject } from "react";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

export type SendChatMessage = (
  message: PromptInputMessage,
  options?: ChatRequestOptions,
) => void | Promise<void>;

export type ChatVisibleStatus =
  | { kind: "idle" }
  | { kind: "submitted"; label: string }
  | { kind: "streaming"; label: string }
  | { kind: "tool-running"; label: string; toolName: string }
  | { kind: "error"; label: string; retryLabel: string };

export type ChatComposerController = {
  input: string;
  setInput: (input: string) => void;
  canSubmit: boolean;
  isBusy: boolean;
  handleSubmit: (message: PromptInputMessage) => void | Promise<void>;
  handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  handleTranscriptionChange: (text: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

export type ChatComposerSubmitArgs = {
  message: PromptInputMessage;
  status: ChatStatus;
};
