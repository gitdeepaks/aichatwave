"use client";

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
import { MessageAttribution } from "@/components/custom/message-attribution";
import { getToolStatusLabel } from "@/components/chat/utils/chat-status";
import { parseToolResult, type ToolResult } from "@/lib/ai/tool-contracts";
import { attachmentKindOf } from "@/lib/ai/attachments";
import { MODEL_IDS, type ModelId } from "@/lib/ai/model-registry";
import type { AppUIMessage } from "@/lib/chat/ui-message";
import type { ChatStatus } from "ai";
import { AlertTriangle, CopyIcon, FileText, Loader2, RefreshCcwIcon, Sparkles } from "lucide-react";
import { Fragment, useState, type ReactElement } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

/**
 * A tool call that has not produced its result yet.
 *
 * Previously these rendered as nothing and the status bar spoke for them,
 * which meant a reloaded conversation containing an interrupted call showed a
 * gap where the work had been. Drawing the call — running or interrupted — is
 * what makes the history match what happened.
 */
function ToolProgress({ toolName, interrupted }: { toolName: string; interrupted: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-fg-muted">
      {interrupted ? (
        <AlertTriangle className="size-3.5 text-warning" aria-hidden />
      ) : (
        <Loader2
          className="size-3.5 animate-spin text-brand-text-strong motion-reduce:animate-none"
          aria-hidden
        />
      )}
      <span>{interrupted ? `${toolName} was interrupted` : getToolStatusLabel(toolName)}</span>
    </div>
  );
}

/**
 * The model's reasoning, collapsed by default.
 *
 * Phase C made the converter preserve reasoning parts and the renderer had no
 * case for them, so they were stored on every turn and shown on none. Collapsed
 * rather than hidden: it is worth being able to see, and not worth pushing the
 * answer off the screen.
 */
function ReasoningBlock({ text }: { text: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-xl border border-hairline bg-glass px-3 py-2">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-subtle transition-colors hover:text-fg-soft"
      >
        <Sparkles className="size-3" aria-hidden />
        {isOpen ? "Hide reasoning" : "Show reasoning"}
      </button>
      {isOpen ? (
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-fg-muted">{text}</p>
      ) : null}
    </div>
  );
}

/** An attachment the user sent, read back through the ownership-checked route. */
function AttachmentPreview({
  url,
  mediaType,
  filename,
}: {
  url: string;
  mediaType: string;
  filename: string | undefined;
}) {
  const label = filename ?? "Attachment";

  if (attachmentKindOf(mediaType) === "image") {
    return (
      // Served by `/api/attachments/[id]`, which checks ownership and redirects
      // to a signed URL that expires in a minute. `next/image` would try to
      // optimize it on a path that is a redirect to a third-party host, so a
      // plain `img` is the honest element here.
      // eslint-disable-next-line @next/next/no-img-element -- redirect to a short-lived signed URL
      <img
        src={url}
        alt={label}
        className="max-h-64 w-auto rounded-xl border border-hairline object-contain"
      />
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-xl border border-hairline bg-glass px-3 py-2 text-xs text-fg transition-colors hover:bg-glass-strong"
    >
      <FileText className="size-4 text-fg-muted" aria-hidden />
      <span className="max-w-48 truncate">{label}</span>
    </a>
  );
}

export const MessageRenderer = ({
  messages,
  status,
  onRegenerate,
}: {
  messages: AppUIMessage[];
  status?: ChatStatus;
  onRegenerate?: (modelId?: ModelId) => void;
}) => {
  const isStreaming = status === "streaming" || status === "submitted";

  return (
    <div className="flex flex-col gap-3">
      {messages.map((message, messageIndex) => {
        const isLastMessage = messageIndex === messages.length - 1;
        const isLiveAssistant = message.role === "assistant" && isLastMessage && isStreaming;

        return (
          <Fragment key={message.id}>
            {message.parts.map((part, index) => {
              const key = `${message.id}-${index}`;

              switch (part.type) {
                case "text":
                  return (
                    <Message from={message.role} key={key}>
                      <MessageContent>
                        {/*
                          No artificial cursor. Streamdown renders the partial
                          text as it arrives and the status bar reports that the
                          turn is live; appending a `▍` to the markdown source
                          meant the "cursor" was a real character that landed
                          inside code blocks and survived a copy.
                        */}
                        <MessageResponse>{part.text}</MessageResponse>
                      </MessageContent>
                    </Message>
                  );

                case "reasoning":
                  return part.text.trim().length === 0 ? null : (
                    <Message from={message.role} key={key}>
                      <MessageContent>
                        <ReasoningBlock text={part.text} />
                      </MessageContent>
                    </Message>
                  );

                case "file":
                  return (
                    <Message from={message.role} key={key}>
                      <MessageContent>
                        <AttachmentPreview
                          url={part.url}
                          mediaType={part.mediaType}
                          filename={part.filename}
                        />
                      </MessageContent>
                    </Message>
                  );

                case "dynamic-tool": {
                  if (part.state === "output-error") {
                    return (
                      <Message from={message.role} key={`${part.toolCallId}-${index}`}>
                        <MessageContent>
                          <div className="flex items-center gap-2 text-xs text-danger-text">
                            <AlertTriangle className="size-3.5" aria-hidden />
                            <span>{part.errorText || `${part.toolName} failed`}</span>
                          </div>
                        </MessageContent>
                      </Message>
                    );
                  }

                  if (part.state !== "output-available") {
                    return (
                      <Message from={message.role} key={`${part.toolCallId}-${index}`}>
                        <MessageContent>
                          <ToolProgress
                            toolName={part.toolName}
                            // A call left unresolved on a message that is not
                            // streaming is a turn that was stopped or died —
                            // it is not going to finish, so it must not show a
                            // spinner forever.
                            interrupted={!isLiveAssistant}
                          />
                        </MessageContent>
                      </Message>
                    );
                  }

                  const toolResult = parseToolResult(part.toolName, part.output);
                  if (!toolResult) return null;

                  return (
                    <Message from={message.role} key={`${part.toolCallId}-${index}`}>
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

            {message.role === "assistant" && !isLiveAssistant ? (
              <AssistantFooter
                message={message}
                showActions={isLastMessage}
                {...(onRegenerate === undefined ? {} : { onRegenerate })}
              />
            ) : null}
          </Fragment>
        );
      })}

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

const MODEL_MENU_LABELS: Record<ModelId, string> = {
  "gpt-5-mini": "GPT-5 mini",
  "gpt-5-nano": "GPT-5 nano",
  "gemini-3.1-pro": "Gemini 3.1 Pro",
  "claude-sonnet-4-20250514": "Claude 4 Sonnet",
};

/** Attribution under every assistant turn; actions only under the last one. */
function AssistantFooter({
  message,
  showActions,
  onRegenerate,
}: {
  message: AppUIMessage;
  showActions: boolean;
  onRegenerate?: (modelId?: ModelId) => void;
}) {
  const text = message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();

  return (
    <div className="mr-auto flex w-full max-w-[94%] flex-col gap-1 sm:max-w-[84%]">
      <MessageAttribution metadata={message.metadata} />

      {showActions ? (
        <MessageActions>
          {onRegenerate ? (
            <>
              <MessageAction onClick={() => onRegenerate()} label="Retry" tooltip="Retry">
                <RefreshCcwIcon className="size-3" />
              </MessageAction>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Retry with a different model"
                    className="rounded-md px-1.5 py-0.5 text-[11px] text-fg-subtle transition-colors hover:bg-glass-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50"
                  >
                    Switch model
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {MODEL_IDS.map((modelId) => (
                    <DropdownMenuItem key={modelId} onSelect={() => onRegenerate(modelId)}>
                      {MODEL_MENU_LABELS[modelId]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}

          {text.length > 0 ? (
            <MessageAction
              onClick={() => void navigator.clipboard.writeText(text)}
              label="Copy"
              tooltip="Copy"
            >
              <CopyIcon className="size-3" />
            </MessageAction>
          ) : null}
        </MessageActions>
      ) : null}
    </div>
  );
}
