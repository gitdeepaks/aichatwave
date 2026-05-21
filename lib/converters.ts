import type { StoredMessage } from "@langchain/core/messages";
import type { UIMessage } from "ai";

type ToolCallData = {
  id?: string;
  name?: string;
  args?: unknown;
};

type MessageDataWithToolCalls = {
  tool_calls?: unknown;
};

type UIMessageRole = UIMessage["role"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasToolCalls(data: unknown): data is MessageDataWithToolCalls {
  return isRecord(data) && "tool_calls" in data;
}

function isToolCallData(value: unknown): value is ToolCallData {
  return isRecord(value);
}

function getRole(messageType: StoredMessage["type"]): UIMessageRole {
  if (messageType === "human") return "user";
  if (messageType === "ai") return "assistant";
  return "system";
}

export function convertLangChainToUI(storedMessages: StoredMessage[]): UIMessage[] {
  const uiMessages: UIMessage[] = [];

  storedMessages?.forEach((m, index) => {
    // 1. Determine Role
    const role = getRole(m.type);

    // 2. Handle Tool Outputs (Merge into previous message)
    if (m.type === "tool") {
      const lastMsg = uiMessages[uiMessages.length - 1];
      if (lastMsg && lastMsg.role === "assistant") {
        // Find the specific tool part that matches this output
        const toolPart = lastMsg.parts?.find(
          (p) => p.type === "dynamic-tool" && p.toolCallId === m.data.tool_call_id,
        );

        if (toolPart && toolPart.type === "dynamic-tool") {
          toolPart.state = "output-available";
          // Matching your UI's specific expected output structure
          toolPart.output = {
            kwargs: { content: m.data.content },
          };
        }
      }
      return;
    }

    const parts: UIMessage["parts"] = [];

    // 3. Extract Text Content
    if (typeof m.data.content === "string" && m.data.content.trim() !== "") {
      parts.push({ type: "text", text: m.data.content });
    }

    const toolCalls = hasToolCalls(m.data) ? m.data.tool_calls : undefined;
    if (m.type === "ai" && Array.isArray(toolCalls)) {
      toolCalls.filter(isToolCallData).forEach((tc) => {
        parts.push({
          type: "dynamic-tool",
          toolCallId: typeof tc.id === "string" ? tc.id : `tool-${index}`,
          toolName: typeof tc.name === "string" ? tc.name : "unknown_tool",
          input: tc.args,
          state: "input-streaming", // Default state
        });
      });
    }

    // 5. Construct final message
    // If 'content' throws an error, it's because the AI SDK expects it inside parts only.
    uiMessages.push({
      id: typeof m.data.id === "string" ? m.data.id : `msg-${index}`,
      role,
      // Remove 'content: ...' if your TS definition for UIMessage strictly uses parts
      parts: parts,
    });
  });

  return uiMessages;
}
