/**
 * Persisted LangChain messages → AI SDK `UIMessage`s.
 *
 * `StoredMessage` is only nominally typed: its `data` is the serialized kwargs
 * of whatever message class produced it, so `tool_calls`, reasoning blocks and
 * block-shaped content are all present at runtime and absent from the declared
 * type. The previous version hand-narrowed six `unknown`s to cope, and dropped
 * reasoning parts and tool error states on the floor.
 *
 * This version parses the stored shape once through `storedMessageSchema` and
 * builds parts from the parsed value, so the conversion is described in one
 * place and a shape the schema does not know about is skipped rather than
 * half-read.
 */

import type { StoredMessage } from "@langchain/core/messages";
import type { UIMessage } from "ai";
import { z } from "zod";
import { jsonValueSchema, type JsonValue } from "@/lib/json";

type UIMessageRole = UIMessage["role"];
type UIMessageParts = UIMessage["parts"];

/**
 * Reasoning reaches us in whichever shape the provider used: a content block
 * carrying `text`, `reasoning` or `thinking`, or an `additional_kwargs` field.
 * Each variant is normalized to plain text here so the renderer sees one shape.
 */
const reasoningBlockSchema = z
  .object({
    type: z.literal(["reasoning", "thinking"]),
    text: z.string().optional(),
    reasoning: z.string().optional(),
    thinking: z.string().optional(),
    summary: z.array(z.object({ text: z.string() })).optional(),
  })
  .transform((block) => ({
    type: "reasoning" as const,
    text:
      block.text ??
      block.reasoning ??
      block.thinking ??
      (block.summary ?? []).map((entry) => entry.text).join("\n"),
  }));

const textBlockSchema = z
  .object({ type: z.literal("text"), text: z.string() })
  .transform((block) => ({ type: "text" as const, text: block.text }));

const storedToolCallSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  args: jsonValueSchema.optional(),
});

const storedMessageSchema = z.object({
  type: z.string(),
  data: z.object({
    id: z.string().optional(),
    content: z.union([z.string(), z.array(jsonValueSchema)]).optional(),
    status: z.literal(["success", "error"]).optional(),
    tool_call_id: z.string().optional(),
    tool_calls: z.array(storedToolCallSchema).optional(),
    additional_kwargs: z.looseObject({ reasoning_content: z.string().optional() }).optional(),
  }),
});

type ParsedStoredMessage = z.infer<typeof storedMessageSchema>;

function toRole(messageType: string): UIMessageRole {
  if (messageType === "human") return "user";
  if (messageType === "ai") return "assistant";
  return "system";
}

/** Plain text of a message, whether its content is a string or blocks. */
function readText(content: string | JsonValue[] | undefined): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((block) => {
      const parsed = textBlockSchema.safeParse(block);
      return parsed.success ? parsed.data.text : "";
    })
    .join("");
}

function readReasoning(message: ParsedStoredMessage): string[] {
  const fromBlocks = Array.isArray(message.data.content)
    ? message.data.content.flatMap((block) => {
        const parsed = reasoningBlockSchema.safeParse(block);
        return parsed.success && parsed.data.text.length > 0 ? [parsed.data.text] : [];
      })
    : [];

  const fromKwargs = message.data.additional_kwargs?.reasoning_content;
  return fromKwargs === undefined || fromKwargs.length === 0
    ? fromBlocks
    : [...fromBlocks, fromKwargs];
}

/**
 * Attaches a tool result to the call it answers. The output is stored as the
 * tool's own payload; `lib/ai/tool-contracts.ts` unwraps whichever transport
 * shape it arrives in.
 */
function applyToolResult(uiMessages: UIMessage[], message: ParsedStoredMessage): void {
  const lastMessage = uiMessages.at(-1);
  if (!lastMessage || lastMessage.role !== "assistant") return;

  const toolPart = lastMessage.parts.find(
    (part) => part.type === "dynamic-tool" && part.toolCallId === message.data.tool_call_id,
  );
  if (!toolPart || toolPart.type !== "dynamic-tool") return;

  const content = readText(message.data.content);

  if (message.data.status === "error") {
    toolPart.state = "output-error";
    toolPart.errorText = content;
    return;
  }

  toolPart.state = "output-available";
  toolPart.output = content;
}

export function convertLangChainToUI(storedMessages: StoredMessage[]): UIMessage[] {
  const uiMessages: UIMessage[] = [];

  storedMessages.forEach((raw, index) => {
    const parsed = storedMessageSchema.safeParse(raw);
    if (!parsed.success) return;
    const message = parsed.data;

    if (message.type === "tool") {
      applyToolResult(uiMessages, message);
      return;
    }

    const parts: UIMessageParts = [];

    for (const reasoning of readReasoning(message)) {
      parts.push({ type: "reasoning", text: reasoning, state: "done" });
    }

    const text = readText(message.data.content);
    if (text.trim() !== "") {
      parts.push({ type: "text", text, state: "done" });
    }

    if (message.type === "ai") {
      for (const toolCall of message.data.tool_calls ?? []) {
        parts.push({
          type: "dynamic-tool",
          toolCallId: toolCall.id ?? `tool-${index}`,
          toolName: toolCall.name ?? "unknown_tool",
          // A stored call was issued, so its input is complete. The result
          // either follows as a tool message or the turn was abandoned.
          state: "input-available",
          input: toolCall.args ?? null,
        });
      }
    }

    if (parts.length === 0) return;

    uiMessages.push({
      id: message.data.id ?? `msg-${index}`,
      role: toRole(message.type),
      parts,
    });
  });

  return uiMessages;
}
