/**
 * The persisted shape of a chat message's content.
 *
 * This is the app's own contract, deliberately independent of the AI SDK's
 * `UIMessage` and of LangChain's `StoredMessage`, so a provider or SDK upgrade
 * cannot silently change what is already written to the database. Both the
 * renderer and the message repository parse through these schemas, so a change
 * here is a compile error on both sides.
 *
 * Client-safe: pure schemas and types, no server imports.
 */

import { z } from "zod";
import { jsonValueSchema } from "@/lib/json";

export const MESSAGE_ROLES = ["user", "assistant", "system"] as const;
export const messageRoleSchema = z.enum(MESSAGE_ROLES);
export type MessageRole = z.infer<typeof messageRoleSchema>;

/**
 * Lifecycle of a tool call. `input-streaming` and `input-available` are
 * transient stream states; only `output-available` and `output-error` are ever
 * persisted, because a turn is not written until it completes.
 */
export const TOOL_PART_STATES = [
  "input-streaming",
  "input-available",
  "output-available",
  "output-error",
] as const;
export const toolPartStateSchema = z.enum(TOOL_PART_STATES);
export type ToolPartState = z.infer<typeof toolPartStateSchema>;

export const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});
export type TextPart = z.infer<typeof textPartSchema>;

export const reasoningPartSchema = z.object({
  type: z.literal("reasoning"),
  text: z.string(),
});
export type ReasoningPart = z.infer<typeof reasoningPartSchema>;

export const toolPartSchema = z.object({
  type: z.literal("tool"),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  state: toolPartStateSchema,
  input: jsonValueSchema,
  output: jsonValueSchema.nullable(),
  errorText: z.string().nullable(),
});
export type ToolPart = z.infer<typeof toolPartSchema>;

export const messagePartSchema = z.discriminatedUnion("type", [
  textPartSchema,
  reasoningPartSchema,
  toolPartSchema,
]);
export type MessagePart = z.infer<typeof messagePartSchema>;

export const messagePartsSchema = z.array(messagePartSchema);
export type MessageParts = z.infer<typeof messagePartsSchema>;

/** Concatenated text of a message, used for titles, search, and previews. */
export function messagePartsToPlainText(parts: MessageParts): string {
  return parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function hasRenderableContent(parts: MessageParts): boolean {
  return parts.some((part) => {
    if (part.type === "tool") return true;
    return part.text.trim().length > 0;
  });
}
