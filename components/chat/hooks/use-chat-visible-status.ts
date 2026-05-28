"use client";

import type { ChatStatus, UIMessage } from "ai";
import { getToolStatusLabel } from "@/components/chat/utils/chat-status";
import type { ChatVisibleStatus } from "@/components/chat/types";

export function useChatVisibleStatus({
  status,
  error,
  messages,
}: {
  status: ChatStatus;
  error: Error | null | undefined;
  messages: UIMessage[];
}): ChatVisibleStatus {
  if (error) {
    return {
      kind: "error",
      label: "Message failed. Retry available.",
      retryLabel: "Retry",
    };
  }

  for (const message of messages.toReversed()) {
    for (const part of message.parts.toReversed()) {
      if (part.type === "dynamic-tool" && part.state !== "output-available") {
        return {
          kind: "tool-running",
          label: getToolStatusLabel(part.toolName),
          toolName: part.toolName,
        };
      }
    }
  }

  if (status === "submitted") {
    return { kind: "submitted", label: "Thinking..." };
  }

  if (status === "streaming") {
    return { kind: "streaming", label: "Writing response..." };
  }

  return { kind: "idle" };
}
