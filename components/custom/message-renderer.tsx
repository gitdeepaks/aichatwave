import {
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { Message } from "@/components/ai-elements/message";
import { NewsCard } from "@/components/gen-ui/news-card";
import { ProductCarousel } from "@/components/gen-ui/product-carousel";
import { WeatherCard } from "@/components/gen-ui/weather-card";
import { parseToolResult, type ToolResult } from "@/lib/ai/tool-contracts";
import type { ChatStatus, UIMessage } from "ai";
import { CopyIcon, RefreshCcwIcon } from "lucide-react";
import { Fragment, type ReactElement } from "react";

const TypingDots = () => (
  <div className="flex items-center gap-1">
    <span className="h-1.5 w-1.5 rounded-full bg-foreground/60 animate-bounce [animation-delay:-0.2s]" />
    <span className="h-1.5 w-1.5 rounded-full bg-foreground/60 animate-bounce [animation-delay:-0.1s]" />
    <span className="h-1.5 w-1.5 rounded-full bg-foreground/60 animate-bounce" />
  </div>
);

/**
 * One card per tool, keyed on the parsed result's discriminant. The result is
 * spread straight into the card because both sides are the same contract type,
 * so adding a tool without a card — or changing a tool's result shape — fails
 * here at compile time rather than rendering a blank card.
 */
const ToolResultCard = ({ toolResult }: { toolResult: ToolResult }): ReactElement => {
  switch (toolResult.toolName) {
    case "display_products":
      return <ProductCarousel {...toolResult.result} />;
    case "display_weather":
      return <WeatherCard {...toolResult.result} />;
    case "display_news":
      return <NewsCard {...toolResult.result} />;
  }
};

export const MessageRenderer = ({
  messages,
  status,
}: {
  messages: UIMessage[];
  status?: ChatStatus;
}) => {
  const isStreaming = status === "streaming" || status === "submitted";
  return (
    <div className="flex flex-col gap-3">
      {messages.map((message: UIMessage, messageIndex: number) => (
        <Fragment key={message.id}>
          {message.parts.map((part, i) => {
            switch (part.type) {
              case "text": {
                const isLastMessage = messageIndex === messages.length - 1;
                return (
                  <Fragment key={`${message.id}-${i}`}>
                    <Message from={message.role}>
                      <MessageContent>
                        <MessageResponse>
                          {message.role === "assistant" && isLastMessage && isStreaming
                            ? `${part.text}\n\n▍`
                            : part.text}
                        </MessageResponse>
                      </MessageContent>
                    </Message>
                    {message.role === "assistant" && isLastMessage && (
                      <MessageActions>
                        <MessageAction onClick={() => {}} label="Retry">
                          <RefreshCcwIcon className="size-3" />
                        </MessageAction>
                        <MessageAction
                          onClick={() => void navigator.clipboard.writeText(part.text)}
                          label="Copy"
                        >
                          <CopyIcon className="size-3" />
                        </MessageAction>
                      </MessageActions>
                    )}
                  </Fragment>
                );
              }
              case "dynamic-tool": {
                // Only a completed call has a payload to render; the transient
                // input states are reported by the status bar instead.
                if (part.state !== "output-available") return null;

                const toolResult = parseToolResult(part.toolName, part.output);
                if (!toolResult) return null;

                return (
                  <Message from={message.role} key={`${part.toolCallId}-${i}`}>
                    <MessageContent>
                      <ToolResultCard toolResult={toolResult} />
                    </MessageContent>
                  </Message>
                );
              }
              default:
                return null;
            }
          })}
        </Fragment>
      ))}

      {isStreaming && messages.at(-1)?.role === "user" && (
        <Message from="assistant">
          <MessageContent>
            <TypingDots />
          </MessageContent>
        </Message>
      )}
    </div>
  );
};
