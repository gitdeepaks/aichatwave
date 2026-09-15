"use client";

import { ChatShell } from "@/components/chat/chat-shell";
import type { MessageDto } from "@/lib/api/contracts";

type ChatInterfaceProps = {
  threadId?: string;
  initialMessages: MessageDto[];
  initialNextCursor: string | null;
};

export const ChatInterfaceNew = (props: ChatInterfaceProps) => {
  return <ChatShell {...props} />;
};
