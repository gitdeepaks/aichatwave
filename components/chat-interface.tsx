"use client";

import type { StoredMessage } from "@langchain/core/messages";
import { ChatShell } from "@/components/chat/chat-shell";

export const ChatInterfaceNew = ({ oldMessages }: { oldMessages: StoredMessage[] }) => {
  return <ChatShell oldMessages={oldMessages} />;
};
