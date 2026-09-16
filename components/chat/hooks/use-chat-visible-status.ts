"use client";

import type { ChatStatus } from "ai";
import type { AppUIMessage } from "@/lib/chat/ui-message";
import { getChatVisibleStatus } from "@/components/chat/utils/chat-status";
import type { ChatVisibleStatus } from "@/components/chat/types";

export function useChatVisibleStatus({
  status,
  error,
  messages,
}: {
  status: ChatStatus;
  error: Error | null | undefined;
  messages: AppUIMessage[];
}): ChatVisibleStatus {
  return getChatVisibleStatus({ status, error, messages });
}
