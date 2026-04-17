import { getDynamicModel, getEffectiveModelId } from "@/app/api/chat/model";
import { MessagesState } from "@/app/api/chat/state";
import { pgConnectionStringWithExplicitVerifyFull } from "@/lib/pg-connection-string";
import { ingestEventToPolar } from "@/lib/polar";
import { getStore } from "@/lib/store";
import { callOpenAIModel } from "@/http/llm";
import { BASE_SYSTEM_PROMPT_TEMPLATE, REMEMBER_MEMORY_PROMPT } from "@/app/api/chat/prompts";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { END, START, StateGraph, type GraphNode } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { waitUntil } from "@vercel/functions";
import { tools } from "./tools";
import { v4 as uuidv4 } from "uuid";

const checkpointer = PostgresSaver.fromConnString(
  pgConnectionStringWithExplicitVerifyFull(process.env.DATABASE_URL!),
);

const store = await getStore();

const memoryRememberNode: GraphNode<typeof MessagesState> = async (
  state: typeof MessagesState.State,
  runtime: any,
) => {
  try {
    const userId = runtime.context?.userId;
    if (!userId) return {};

    const namespace = [userId, "memories"];
    const lastMessage = state.messages.at(-1);
    if (!lastMessage) return {};

    const content = typeof lastMessage.content === "string" ? lastMessage.content : "";
    if (content.trim().length < 5) return {};

    const existingItems = await store.search(namespace);
    const existingTexts = existingItems.map((it) => it.value?.data).filter(Boolean);
    const userDetailsContent =
      existingTexts.length > 0 ? existingTexts.map((t) => `- ${t}`).join("\n") : "(empty)";

    const sysMsgText = await REMEMBER_MEMORY_PROMPT.format({
      user_details_content: userDetailsContent,
    });

    const sysmsg = new SystemMessage({ content: sysMsgText });
    const usermsgs = [new HumanMessage(`USER MESSAGE:\n${content}`)];

    const memoryDecisionOutput = await callOpenAIModel({
      usermsgs,
      sysmsg,
      structuredOutput: true,
    });

    if (!memoryDecisionOutput || typeof memoryDecisionOutput === "string") return {};
    if (!memoryDecisionOutput.should_write) return {};

    for (const mem of memoryDecisionOutput.memories ?? []) {
      if (mem?.is_new && mem.text?.trim()) {
        await store.put(namespace, uuidv4(), { data: mem.text.trim() });
      }
    }
  } catch (err) {
    console.error("[Memory] memoryRememberNode failed (non-fatal):", err);
  }

  return {};
};

const llmCall: GraphNode<typeof MessagesState> = async (
  state: typeof MessagesState.State,
  runtime: any,
) => {
  const selectedModel =
    (runtime.context?.selectedModel as string | undefined) ??
    (runtime.context?.model as string | undefined);
  const userId = runtime.context?.userId;

  const modelId = getEffectiveModelId(selectedModel);
  const model = getDynamicModel(modelId);
  const modelWithTools = model.bindTools(tools);

  let memoriesContent = "(empty)";
  if (userId) {
    try {
      const namespace = [userId, "memories"];
      const existingItems = await store.search(namespace);
      const existingTexts = existingItems.map((it) => it.value?.data).filter(Boolean);
      if (existingTexts.length > 0) {
        memoriesContent = existingTexts.map((t) => `- ${t}`).join("\n");
      }
    } catch (err) {
      console.error("[Memory] Failed to read memories (non-fatal):", err);
    }
  }

  const formattedSystemPrompt = await BASE_SYSTEM_PROMPT_TEMPLATE.format({
    user_details_content: memoriesContent,
  });

  const response = await modelWithTools.invoke([
    new SystemMessage(formattedSystemPrompt),
    ...state.messages,
  ]);

  const usage = response.usage_metadata;
  waitUntil(
    ingestEventToPolar({
      userId,
      model: modelId,
      inputTokens: usage?.input_tokens || 0,
      outputTokens: usage?.output_tokens || 0,
      totalTokens: usage?.total_tokens || 0,
    }),
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
