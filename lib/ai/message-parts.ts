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
 * Lifecycle of a tool call.
 *
 * Since Phase G a turn is written once, when its stream settles, so a
 * persisted call is normally terminal — `output-available` or `output-error`.
 * The two input states are still representable because an aborted or failed
 * stream is recorded exactly as far as it got: a call the model asked for but
 * whose tool never answered stays `input-available`, and the renderer shows it
 * as interrupted rather than pretending it produced nothing.
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

/**
 * A file the user attached, stored by reference.
 *
 * The bytes live in the `attachment` table and are served from
 * `attachmentUrl(attachmentId)`; only the reference is written into `parts`,
 * so a message row stays small and the same upload can be re-read by the model
 * on a regenerate without being re-encoded into the history.
 */
export const filePartSchema = z.object({
  type: z.literal("file"),
  attachmentId: z.string().min(1),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});
export type FilePart = z.infer<typeof filePartSchema>;

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
  filePartSchema,
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
    if (part.type === "tool" || part.type === "file") return true;
    return part.text.trim().length > 0;
  });
}

/** The attachments carried by a message, in the order they were attached. */
export function messageFileParts(parts: MessageParts): FilePart[] {
  return parts.filter((part): part is FilePart => part.type === "file");
}
