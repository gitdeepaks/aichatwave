"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useState } from "react";
import InputContainer from "./input-container";
import { useChatStore } from "@/store/chat-store";
import { MessageRenderer } from "@/components/custom/message-renderer";
import type { UIMessage } from "ai";
import type { StoredMessage } from "@langchain/core/messages";
import { convertLangChainToUI } from "@/lib/converters";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";

export const ChatInterfaceNew = ({ oldMessages }: { oldMessages: StoredMessage[] }) => {
  const { chatInstance } = useChatStore();
  const convertedOldMessages = convertLangChainToUI(oldMessages);
  const { messages } = useChat({
    chat: chatInstance,
  });
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Keep initial client render aligned with SSR to avoid hydration mismatch.
  const liveMessages = isHydrated ? (messages as UIMessage[]) : [];
  return (
    <>
      {liveMessages.length === 0 && convertedOldMessages.length === 0 ? (
        <div className="flex flex-col flex-1 h-full w-full min-h-0 overflow-y-scroll">
          <main className="h-full flex flex-col items-center  justify-end md:justify-center max-w-4xl mx-auto w-full px-4 -mt-20">
            <h1 className="text-3xl font-normal mb-8 tracking-tight text-white">
              What can I help with ?
            </h1>
            <InputContainer />
          </main>
        </div>
      ) : (
        <div className="flex flex-col flex-1 h-full w-full min-h-0 overflow-hidden">
          <main className="h-full flex flex-col items-center max-w-4xl mx-auto w-full px-4 pt-4">
            <div className="flex flex-col gap-4 h-full w-full min-h-0">
              <div className="flex-1 min-h-0 overflow-hidden">
                <Conversation className="h-full min-h-0">
                  <ConversationContent className="max-w-200 mx-auto px-4 pt-4">
                    <MessageRenderer messages={convertedOldMessages} />
                    <MessageRenderer messages={liveMessages} />
                  </ConversationContent>
                  <ConversationScrollButton />
                </Conversation>
              </div>
              <div className="flex flex-col gap-4">
                <InputContainer />
              </div>
            </div>
          </main>
        </div>
      )}
    </>
  );
};
