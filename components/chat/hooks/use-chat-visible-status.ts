"use client";

import type { ChatStatus, UIMessage } from "ai";
import { getChatVisibleStatus } from "@/components/chat/utils/chat-status";
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
  return getChatVisibleStatus({ status, error, messages });
}
