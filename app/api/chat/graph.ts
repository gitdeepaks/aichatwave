import { getDynamicModel } from "@/app/api/chat/model";
import { MessagesState } from "@/app/api/chat/state";
import { productTool } from "@/app/api/chat/tools";
import { pgConnectionStringWithExplicitVerifyFull } from "@/lib/pg-connection-string";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { END, MemorySaver, START, StateGraph, type GraphNode } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tools } from "./tools";

const llmCall: GraphNode<typeof MessagesState> = async (state) => {
  //todo: reciev this modelID from frontend
  const model = getDynamicModel("gpt-5-mini");
  const modelWithTools = model.bindTools(tools);
  const response = await modelWithTools.invoke([
    new SystemMessage(
      "You are a helpful assistant. Please answer the question in a concise and to the point manner.",
    ),
    ...state.messages,
  ]);
  return {
    messages: [response],
  };
};

const checkpointer = PostgresSaver.fromConnString(
  pgConnectionStringWithExplicitVerifyFull(process.env.DATABASE_URL!),
);

//do this for the first time only
// await checkpointer.setup();

function shouldContinue(state: typeof MessagesState.State) {
  const lastMessage = state.messages.at(-1);
  if (!lastMessage || !AIMessage.isInstance(lastMessage)) return "__end__";
  if (lastMessage.tool_calls?.length) return "tools";
  return "__end__";
}
const toolNode = new ToolNode(tools);

export const agent = new StateGraph(MessagesState)
  .addNode("callllm", llmCall)
  .addNode("tools", toolNode)
  .addEdge(START, "callllm")
  .addConditionalEdges("callllm", shouldContinue, {
    __end__: END,
    tools: "tools",
  })
  // .addEdge("callllm", END)
  .compile({ checkpointer });
