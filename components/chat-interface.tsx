"use client";

import { ChatShell } from "@/components/chat/chat-shell";

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
  /**
   * Whether this id names a conversation that does not exist yet.
   *
   * The transcript itself is no longer handed down from the server — Phase L
   * moved it onto the client cache, so a revisited thread renders from disk
   * rather than from a round trip. This flag is the one thing the client
   * cannot work out for itself, and it is what stops the home page fetching
   * the history of a thread that has none.
   */
  isNewThread: boolean;
};

export const ChatInterfaceNew = (props: ChatInterfaceProps) => {
  return <ChatShell {...props} />;
};
