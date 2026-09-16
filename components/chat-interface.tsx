"use client";

import { ChatShell } from "@/components/chat/chat-shell";
import type { MessageDto } from "@/lib/api/contracts";

type ChatInterfaceProps = {
  /**
   * The conversation this view posts to.
   *
   * Always present, including on the home page, where the server mints one for
   * the not-yet-created thread. It used to be optional and the composer
   * generated its own, which meant the chat instance and the thread it wrote to
   * could disagree about which conversation was being had.
   */
  threadId: string;
  initialMessages: MessageDto[];
  initialNextCursor: string | null;
};

export const ChatInterfaceNew = (props: ChatInterfaceProps) => {
  return <ChatShell {...props} />;
};
