/**
 * Writes chat turns into the app's own `message` table.
 *
 * LangGraph's checkpoint remains the agent's working state; this table is the
 * durable record the product reads for history, search, export, and deletion.
 * Both are written during the migration period — the checkpoint is still the
 * read path until the client is switched over.
 *
 * Persistence is best-effort and never fails a turn: a database hiccup must not
 * cost the user the answer they are already reading.
 */

import { randomUUID } from "node:crypto";
import type { AIMessage, BaseMessage } from "@langchain/core/messages";
import type { ModelId } from "@/lib/ai/model-registry";
import { hasRenderableContent, type MessageParts, type ToolPart } from "@/lib/ai/message-parts";
import { jsonValueSchema } from "@/lib/json";
import { appendMessages } from "@/server/db/message-repository";
import { touchThread } from "@/server/db/thread-repository";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

/** Flattens LangChain's string-or-blocks content into plain text. */
function readTextContent(message: BaseMessage): string {
  if (typeof message.content === "string") return message.content;

  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
}

function toToolParts(message: AIMessage): ToolPart[] {
  return (message.tool_calls ?? []).map((call) => ({
    type: "tool",
    toolCallId: call.id ?? randomUUID(),
    toolName: call.name,
    state: "input-available",
    input: jsonValueSchema.catch(null).parse(call.args),
    output: null,
    errorText: null,
  }));
}

export async function persistUserTurn(params: {
  threadId: string;
  content: string;
  log?: Logger;
}): Promise<void> {
  const log = params.log ?? rootLogger;
  const parts: MessageParts = [{ type: "text", text: params.content }];

  try {
    await appendMessages([{ id: randomUUID(), threadId: params.threadId, role: "user", parts }]);
    await touchThread({ threadId: params.threadId, at: new Date() });
  } catch (error) {
    log.error("message.persist_user_failed", { threadId: params.threadId }, error);
  }
}

export async function persistAssistantTurn(params: {
  threadId: string;
  message: AIMessage;
  modelId: ModelId;
  inputTokens: number;
  outputTokens: number;
  log?: Logger;
}): Promise<void> {
  const log = params.log ?? rootLogger;

  const text = readTextContent(params.message);
  const parts: MessageParts = [
    ...(text.trim().length > 0 ? [{ type: "text" as const, text }] : []),
    ...toToolParts(params.message),
  ];

  if (!hasRenderableContent(parts)) return;

  try {
    await appendMessages([
      {
        id: randomUUID(),
        threadId: params.threadId,
        role: "assistant",
        parts,
        modelId: params.modelId,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
      },
    ]);
    await touchThread({ threadId: params.threadId, at: new Date() });
  } catch (error) {
    log.error("message.persist_assistant_failed", { threadId: params.threadId }, error);
  }
}
