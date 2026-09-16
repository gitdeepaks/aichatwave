/**
 * Database message → `UIMessage`, without losing what was persisted.
 *
 * The two shapes are deliberately different types (see `lib/ai/message-parts.ts`)
 * and this is the one place they meet. Both sides are exhaustive unions, so a
 * part added to either contract fails to compile here rather than silently
 * rendering as nothing.
 */

import type { UIMessage } from "ai";
import { attachmentUrl } from "@/lib/ai/attachments";
import type { MessagePart } from "@/lib/ai/message-parts";
import type { MessageDto } from "@/lib/api/contracts";
import type { AppUIMessage, ChatMessageMetadata } from "@/lib/chat/ui-message";

type UIPart = UIMessage["parts"][number];

/**
 * Exhaustive over `MessagePart`. The `tool` branch is exhaustive over
 * `ToolPartState` in turn, because the AI SDK's `dynamic-tool` part is a
 * discriminated union whose members carry different fields — `output` only
 * exists once there is one — so each state has to be built separately rather
 * than spread from a common object.
 */
function toUIPart(part: MessagePart): UIPart {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text, state: "done" };

    case "reasoning":
      return { type: "reasoning", text: part.text, state: "done" };

    case "file":
      // Points at this app's own route, never at the storage URL: the object
      // is private and its signed URL expires, so persisting one would produce
      // history whose images stop loading.
      return {
        type: "file",
        mediaType: part.mediaType,
        filename: part.filename,
        url: attachmentUrl(part.attachmentId),
      };

    case "tool":
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
  }
}

/**
 * The attribution a message carries, rebuilt from the columns it was stored
 * with so a reloaded conversation shows the same model and cost the live
 * stream reported through its `message-metadata` chunk.
 */
function toMetadata(message: MessageDto): ChatMessageMetadata {
  return {
    modelId: message.modelId,
    inputTokens: message.inputTokens,
    outputTokens: message.outputTokens,
    createdAt: message.createdAt,
  };
}

export function convertMessageDtoToUI(message: MessageDto): AppUIMessage {
  return {
    id: message.id,
    role: message.role,
    parts: message.parts.map(toUIPart),
    metadata: toMetadata(message),
  };
}

export function convertMessageDtosToUI(messages: MessageDto[]): AppUIMessage[] {
  return messages.map(convertMessageDtoToUI);
}

/** Prepends an earlier chronological page while retaining one message per id. */
export function mergeEarlierMessages(
  current: AppUIMessage[],
  earlier: AppUIMessage[],
): AppUIMessage[] {
  const seen = new Set(current.map((message) => message.id));
  const uniqueEarlier: AppUIMessage[] = [];

  for (let index = earlier.length - 1; index >= 0; index -= 1) {
    const message = earlier[index];
    if (!message || seen.has(message.id)) continue;
    seen.add(message.id);
    uniqueEarlier.unshift(message);
  }

  return [...uniqueEarlier, ...current];
}
