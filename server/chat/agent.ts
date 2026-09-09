import { getDynamicModel, getEffectiveModelId } from "@/server/ai/model-service";
import { MessagesState } from "@/server/chat/state";
import { chatRuntimeContextSchema, type ChatRuntimeContext } from "@/server/chat/runtime-context";
import { tools } from "@/server/chat/tools";
import { BASE_SYSTEM_PROMPT_TEMPLATE } from "@/server/chat/prompts";
import { extractAndStoreMemories, getMemoriesPromptContent } from "@/server/memory/memory-service";
import { ingestModelUsage } from "@/server/billing/subscription-service";
import { persistAssistantTurn } from "@/server/chat/turn-persistence";
import { pgConnectionStringWithExplicitVerifyFull } from "@/lib/pg-connection-string";
import { getStore } from "@/server/memory/store";
import { logger } from "@/server/lib/logger";
import { createLlmCallId } from "@/server/lib/request-id";
import { env } from "@/lib/env";
import { AIMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { END, START, StateGraph, type GraphNode } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { waitUntil } from "@vercel/functions";

const checkpointer = PostgresSaver.fromConnString(
  pgConnectionStringWithExplicitVerifyFull(env.DATABASE_URL),
);

// Schema creation happens in `pnpm migration:migrate`, not on the request path.
const store = getStore();

export type { ChatRuntimeContext };

type ChatRuntime = {
  context?: unknown;
};

/**
 * Parses the runtime context once, at the edge of each node. Nodes then work
 * with a fully-required `ChatRuntimeContext` instead of defending against
 * missing fields — a turn without a user id is not representable past this line.
 */
function readContext(runtime: ChatRuntime): ChatRuntimeContext {
  return chatRuntimeContextSchema.parse(runtime.context);
}

/** Text of the most recent human message, used as the memory retrieval query. */
function latestUserText(messages: BaseMessage[]): string {
  const last = messages.at(-1);
  if (!last) return "";
  return typeof last.content === "string" ? last.content : "";
}

const memoryRememberNode: GraphNode<typeof MessagesState> = async (
  state: typeof MessagesState.State,
  runtime: ChatRuntime,
) => {
  const context = readContext(runtime);
  const content = latestUserText(state.messages).trim();
  if (content.length === 0) return {};

  await extractAndStoreMemories({
    userId: context.userId,
    messageContent: content,
    log: logger.child({
      requestId: context.requestId,
      userId: context.userId,
      node: "memoryRememberNode",
    }),
  });

  return {};
};

const llmCall: GraphNode<typeof MessagesState> = async (
  state: typeof MessagesState.State,
  runtime: ChatRuntime,
) => {
  const context = readContext(runtime);
  const llmCallId = createLlmCallId();
  const modelId = getEffectiveModelId(context.selectedModel);
  const log = logger.child({
    requestId: context.requestId,
    llmCallId,
    userId: context.userId,
    threadId: context.threadId,
    modelId,
    node: "llmCall",
  });

  const modelWithTools = getDynamicModel(modelId).bindTools(tools);

  const memoriesContent = await getMemoriesPromptContent(
    { userId: context.userId, query: latestUserText(state.messages) },
    log,
  );

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
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;

  log.info("llm.call_completed", {
    latencyMs: Date.now() - startedAt,
    inputTokens,
    outputTokens,
    totalTokens: usage?.total_tokens ?? 0,
    toolCalls: response.tool_calls?.length ?? 0,
  });

  waitUntil(
    persistAssistantTurn({
      threadId: context.threadId,
      message: response,
      modelId,
      inputTokens,
      outputTokens,
      log,
    }),
  );

  waitUntil(
    ingestModelUsage(
      {
        userId: context.userId,
        model: modelId,
        requestId: context.requestId,
        llmCallId,
        inputTokens,
        outputTokens,
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
