import type { UIMessage } from "ai";
import type { MessageDto } from "@/lib/api/contracts";

/** Converts the validated message-table DTO without losing persisted part state. */
export function convertMessageDtoToUI(message: MessageDto): UIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: message.parts.map((part) => {
      if (part.type === "text") {
        return { type: "text", text: part.text, state: "done" };
      }
      if (part.type === "reasoning") {
        return { type: "reasoning", text: part.text, state: "done" };
      }

      switch (part.state) {
        case "input-streaming":
          return {
            type: "dynamic-tool",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
            state: "input-streaming",
          };
        case "input-available":
          return {
            type: "dynamic-tool",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
            state: "input-available",
          };
        case "output-available":
          return {
            type: "dynamic-tool",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
            state: "output-available",
            output: part.output,
          };
        case "output-error":
          return {
            type: "dynamic-tool",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
            state: "output-error",
            errorText: part.errorText ?? "",
          };
      }
    }),
  };
}

export function convertMessageDtosToUI(messages: MessageDto[]): UIMessage[] {
  return messages.map(convertMessageDtoToUI);
}

/** Prepends an earlier chronological page while retaining one message per id. */
export function mergeEarlierMessages(current: UIMessage[], earlier: UIMessage[]): UIMessage[] {
  const seen = new Set(current.map((message) => message.id));
  const uniqueEarlier: UIMessage[] = [];

  for (let index = earlier.length - 1; index >= 0; index -= 1) {
    const message = earlier[index];
    if (!message || seen.has(message.id)) continue;
    seen.add(message.id);
    uniqueEarlier.unshift(message);
  }

  return [...uniqueEarlier, ...current];
}
