import { z } from "zod";
import { messagePartsSchema, type MessageParts } from "@/lib/ai/message-parts";
import { MODEL_IDS, type ModelId } from "@/lib/ai/model-registry";

const isoDateTime = z.iso.datetime({ offset: true });

export const conversationExportMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  parts: messagePartsSchema,
  modelId: z.enum(MODEL_IDS).nullable(),
  tokens: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
  }),
  createdAt: isoDateTime,
});

export const conversationExportSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: isoDateTime,
  thread: z.object({
    id: z.string().min(1),
    title: z.string(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
    lastMessageAt: isoDateTime.nullable(),
    archivedAt: isoDateTime.nullable(),
    pinnedAt: isoDateTime.nullable(),
  }),
  messages: z.array(conversationExportMessageSchema),
});

export type ConversationExportThread = z.infer<typeof conversationExportSchema>["thread"];
export type ConversationExportMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: MessageParts;
  modelId: ModelId | null;
  tokens: { input: number; output: number };
  createdAt: string;
};

export function serializeJsonExportStart(params: {
  exportedAt: string;
  thread: ConversationExportThread;
}): string {
  const prefix = JSON.stringify({
    schemaVersion: 1,
    exportedAt: params.exportedAt,
    thread: params.thread,
  });
  return `${prefix.slice(0, -1)},"messages":[`;
}

export function serializeJsonExportMessage(
  message: ConversationExportMessage,
  first: boolean,
): string {
  return `${first ? "" : ","}${JSON.stringify(message)}`;
}

export function serializeJsonExportEnd(): string {
  return "]}";
}

export function serializeMarkdownExportStart(params: {
  exportedAt: string;
  thread: ConversationExportThread;
}): string {
  const { thread } = params;
  return [
    `# ${thread.title}`,
    "",
    `- Thread ID: ${thread.id}`,
    `- Created: ${thread.createdAt}`,
    `- Updated: ${thread.updatedAt}`,
    `- Last message: ${thread.lastMessageAt ?? "none"}`,
    `- Archived: ${thread.archivedAt ?? "no"}`,
    `- Pinned: ${thread.pinnedAt ?? "no"}`,
    `- Exported: ${params.exportedAt}`,
    "",
  ].join("\n");
}

export function serializeMarkdownExportMessage(message: ConversationExportMessage): string {
  const partsJson = JSON.stringify(message.parts, null, 2);
  const backtickRuns = partsJson.match(/`+/g) ?? [];
  const longestRun = backtickRuns.reduce((longest, run) => Math.max(longest, run.length), 0);
  const fence = "`".repeat(Math.max(3, longestRun + 1));

  return [
    `## ${message.role} · ${message.createdAt}`,
    "",
    `- Message ID: ${message.id}`,
    `- Model: ${message.modelId ?? "none"}`,
    `- Input tokens: ${message.tokens.input}`,
    `- Output tokens: ${message.tokens.output}`,
    "",
    `${fence}json`,
    partsJson,
    fence,
    "",
  ].join("\n");
}

export function safeExportFilename(title: string, extension: "json" | "md"): string {
  const stem = title
    .replace(/[\x00-\x1F\x7F]+/g, "-")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${stem.length > 0 ? stem : "conversation"}.${extension}`;
}
