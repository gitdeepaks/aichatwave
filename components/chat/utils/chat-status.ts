import type { ChatStatus, UIMessage } from "ai";
import type { ChatVisibleStatus } from "@/components/chat/types";
import { parseToolName, type ToolName } from "@/lib/ai/tool-contracts";

/** Keyed on `ToolName`, so a new tool needs a label before it compiles. */
const TOOL_STATUS_LABELS: Record<ToolName, string> = {
  display_products: "Searching products...",
  display_weather: "Fetching weather...",
  display_news: "Reading market news...",
};

export function getToolStatusLabel(toolName: string): string {
  const name = parseToolName(toolName);
  return name === null ? "Using tools..." : TOOL_STATUS_LABELS[name];
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
