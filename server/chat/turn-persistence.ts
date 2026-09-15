/**
 * Writes chat turns into the app's own `message` table.
 *
 * LangGraph's checkpoint remains the agent's working state; this table is the
 * durable record the product reads for history, search, export, and deletion.
 * LangGraph still writes its checkpoint for agent execution, while all product
 * reads use this table.
 *
 * Persistence is best-effort and never fails a turn: a database hiccup is
 * logged without replacing the model answer with an application error.
 */

import { randomUUID } from "node:crypto";
import { ToolMessage, type AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ModelId } from "@/lib/ai/model-registry";
import { hasRenderableContent, type MessageParts, type ToolPart } from "@/lib/ai/message-parts";
import { jsonValueSchema } from "@/lib/json";
import { appendMessages, completeToolCall } from "@/server/db/message-repository";
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
  userId: string;
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
  userId: string;
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

export async function persistToolResults(params: {
  threadId: string;
  messages: BaseMessage[];
  log?: Logger;
}): Promise<void> {
  const log = params.log ?? rootLogger;

  for (const message of params.messages) {
    if (!ToolMessage.isInstance(message)) continue;
    const output = jsonValueSchema.catch(readTextContent(message)).parse(message.content);
    const errorText = message.status === "error" ? readTextContent(message) : null;

    try {
      const completed = await completeToolCall({
        threadId: params.threadId,
        toolCallId: message.tool_call_id,
        output,
        errorText,
        log,
      });
      if (!completed) {
        log.warn("message.tool_call_not_found", { toolCallId: message.tool_call_id });
      }
    } catch (error) {
      log.error(
        "message.persist_tool_result_failed",
        { threadId: params.threadId, toolCallId: message.tool_call_id },
        error,
      );
    }
  }
}
