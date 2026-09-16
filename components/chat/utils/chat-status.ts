import type { ChatStatus } from "ai";
import type { AppUIMessage } from "@/lib/chat/ui-message";
import type { ChatVisibleStatus } from "@/components/chat/types";
import { formatRetryDelay, parseChatError } from "@/lib/api/chat-error";
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
  messages: AppUIMessage[];
}): ChatVisibleStatus {
  const chatError = parseChatError(error);
  if (chatError !== null) {
    switch (chatError.kind) {
      case "rate-limited":
        return {
          kind: "rate-limited",
          label:
            chatError.retryAfterSeconds === null
              ? chatError.message
              : `${chatError.message} (${formatRetryDelay(chatError.retryAfterSeconds)})`,
          retryLabel: "Try again",
          retryAfterSeconds: chatError.retryAfterSeconds,
        };

      case "quota-exceeded":
        return {
          kind: "quota-exceeded",
          label: chatError.message,
          upgradeLabel: "Upgrade to Pro",
        };

      case "model-access-denied":
        return {
          kind: "quota-exceeded",
          label: chatError.message,
          upgradeLabel: "Upgrade to Pro",
        };

      case "unauthorized":
      case "unavailable":
      case "unknown":
        // Everything else keeps the original generic treatment: a retry is the
        // only useful control, and the server's message is already written for
        // the user.
        return {
          kind: "error",
          label: "Message failed. Retry available.",
          retryLabel: "Retry",
        };
    }
  }

  // A tool is only *running* while the turn is. On an idle conversation an
  // unresolved call is the residue of a stopped or failed turn, and reporting
  // it as in-progress is what produced the permanent spinner: the status bar
  // spoke for a tool that nothing was going to answer.
  if (status === "submitted" || status === "streaming") {
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
  }

  if (status === "submitted") {
    return { kind: "submitted", label: "Thinking..." };
  }

  if (status === "streaming") {
    return { kind: "streaming", label: "Writing response..." };
  }

  return { kind: "idle" };
}
