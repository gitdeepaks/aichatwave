import { getDynamicModel, getEffectiveModelId, type ModelId } from "@/server/ai/model-service";
import { MessagesState } from "@/server/chat/state";
import { tools } from "@/server/chat/tools";
import { BASE_SYSTEM_PROMPT_TEMPLATE } from "@/server/chat/prompts";
import {
  extractAndStoreMemories,
  getMemoriesPromptContent,
} from "@/server/memory/memory-service";
import { ingestModelUsage } from "@/server/billing/subscription-service";
import { pgConnectionStringWithExplicitVerifyFull } from "@/lib/pg-connection-string";
import { getStore } from "@/server/memory/store";
import { logger } from "@/server/lib/logger";
import { createLlmCallId } from "@/server/lib/request-id";
import { env } from "@/lib/env";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { END, START, StateGraph, type GraphNode } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { waitUntil } from "@vercel/functions";

const checkpointer = PostgresSaver.fromConnString(
  pgConnectionStringWithExplicitVerifyFull(env.DATABASE_URL),
);

const store = await getStore();

export type ChatRuntimeContext = {
  userId: string;
  selectedModel: ModelId;
  requestId: string;
};

type ChatRuntime = {
  context?: Partial<ChatRuntimeContext>;
};

function getRuntimeString(value: string | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const memoryRememberNode: GraphNode<typeof MessagesState> = async (
  state: typeof MessagesState.State,
  runtime: ChatRuntime,
) => {
  const userId = getRuntimeString(runtime.context?.userId);
  const requestId = getRuntimeString(runtime.context?.requestId);
  if (!userId) return {};

  const lastMessage = state.messages.at(-1);
  if (!lastMessage) return {};

  const content = typeof lastMessage.content === "string" ? lastMessage.content : "";
  if (content.trim().length === 0) return {};

  await extractAndStoreMemories({
    userId,
    messageContent: content,
    log: logger.child({ requestId, userId, node: "memoryRememberNode" }),
  });

  return {};
};

const llmCall: GraphNode<typeof MessagesState> = async (
  state: typeof MessagesState.State,
  runtime: ChatRuntime,
) => {
  const selectedModel = runtime.context?.selectedModel;
  const userId = getRuntimeString(runtime.context?.userId);
  const requestId = getRuntimeString(runtime.context?.requestId) ?? "unknown";
  const llmCallId = createLlmCallId();

  const modelId = getEffectiveModelId(selectedModel);
  const log = logger.child({ requestId, llmCallId, userId, modelId, node: "llmCall" });

  const model = getDynamicModel(modelId);
  const modelWithTools = model.bindTools(tools);

  let memoriesContent = "(empty)";
  if (userId) {
    memoriesContent = await getMemoriesPromptContent(userId, log);
  }

  const formattedSystemPrompt = await BASE_SYSTEM_PROMPT_TEMPLATE.format({
    user_details_content: memoriesContent,
  });

  const startedAt = Date.now();

  const response = await modelWithTools
    .invoke([new SystemMessage(formattedSystemPrompt), ...state.messages])
    .catch((error: unknown) => {
      log.error("llm.call_failed", { latencyMs: Date.now() - startedAt }, error);
      throw error;
    });

  const usage = response.usage_metadata;
  log.info("llm.call_completed", {
    latencyMs: Date.now() - startedAt,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
    toolCalls: response.tool_calls?.length ?? 0,
  });

  waitUntil(
    ingestModelUsage(
      {
        userId,
        model: modelId,
        requestId,
        llmCallId,
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      log,
    ),
  );

  return { messages: [response] };
};

function shouldContinue(state: typeof MessagesState.State) {
  const lastMessage = state.messages.at(-1);
  if (!lastMessage || !AIMessage.isInstance(lastMessage)) return "__end__";
  if (lastMessage.tool_calls?.length) return "tools";
  return "__end__";
}
const toolNode = new ToolNode(tools);

export const agent = new StateGraph(MessagesState)
  .addNode("callLlm", llmCall)
  .addNode("tools", toolNode)
  .addNode("memoryRememberNode", memoryRememberNode)
  .addConditionalEdges(START, () => ["callLlm", "memoryRememberNode"], {
    callLlm: "callLlm",
    memoryRememberNode: "memoryRememberNode",
  })
  .addEdge("memoryRememberNode", END)
  .addConditionalEdges("callLlm", shouldContinue, {
    __end__: END,
    tools: "tools",
  })
  .addEdge("tools", "callLlm")
  .compile({ checkpointer, store });
