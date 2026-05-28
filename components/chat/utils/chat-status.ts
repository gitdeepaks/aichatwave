import type { ChatStatus, UIMessage } from "ai";
import type { ChatVisibleStatus } from "@/components/chat/types";

export function getToolStatusLabel(toolName: string): string {
  switch (toolName) {
    case "display_products":
    case "display-products":
      return "Searching products...";
    case "display_weather":
    case "display-weather":
      return "Fetching weather...";
    case "display_news":
    case "display-news":
      return "Reading market news...";
    default:
      return "Using tools...";
  }
}

export function getChatVisibleStatus({
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
