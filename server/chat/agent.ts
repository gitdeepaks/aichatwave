import { z } from "zod";
import { getDynamicModel, getEffectiveModelId } from "@/server/ai/model-service";
import { MessagesState } from "@/server/chat/state";
import {
  chatRuntimeContextSchema,
  type ChatRuntimeContext,
  type TurnId,
} from "@/server/chat/runtime-context";
import { tools } from "@/server/chat/tools";
import { BASE_SYSTEM_PROMPT_TEMPLATE } from "@/server/chat/prompts";
import { fenceUntrustedMessages, fenceUserMemories } from "@/server/chat/untrusted-content";
import { ingestModelUsage } from "@/server/billing/subscription-service";
import { recordQuotaTokens } from "@/server/billing/quota-service";
import { usagePeriodFor } from "@/lib/billing/plan-policy";
import { findTurn, recordTurnUsage } from "@/server/chat/turn-registry";
import { pgConnectionStringWithExplicitVerifyFull } from "@/lib/pg-connection-string";
import { getStore } from "@/server/memory/store";
import { logger } from "@/server/lib/logger";
import { createLlmCallId } from "@/server/lib/request-id";
import { env } from "@/lib/env";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  isBaseMessage,
  type AIMessageChunk,
  type BaseMessage,
} from "@langchain/core/messages";
import {
  END,
  START,
  StateGraph,
  type GraphNode,
  type LangGraphRunnableConfig,
} from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { waitUntil } from "@vercel/functions";

const checkpointer = PostgresSaver.fromConnString(
  pgConnectionStringWithExplicitVerifyFull(env.DATABASE_URL),
);

// Schema creation happens in `pnpm migration:migrate`, not on the request path.
const store = getStore();

export type { ChatRuntimeContext };

/**
 * Parses the runtime context once, on entry to each node. LangGraph types the
 * context loosely — it is delivered through the run config — so this is the
 * line that turns it into a fully-required `ChatRuntimeContext`: a turn
 * without a user id is not representable past here.
 */
function readContext(runtime: LangGraphRunnableConfig): ChatRuntimeContext {
  return chatRuntimeContextSchema.parse(runtime.context);
}

/**
 * Token counts as the provider reported them.
 *
 * LangChain's own type for `usage_metadata` resolves to `never` under
 * `exactOptionalPropertyTypes`, and the value is a provider payload either
 * way, so it is parsed here like any other external input rather than trusted.
 */
const usageMetadataSchema = z
  .object({
    input_tokens: z.number().nonnegative().optional(),
    output_tokens: z.number().nonnegative().optional(),
    total_tokens: z.number().nonnegative().optional(),
  })
  .catch({});

/**
 * Puts the current turn's attachment bytes in front of the model, and only the
 * current turn's.
 *
 * Graph state deliberately never holds a file. The user's message enters the
 * graph as text — with a one-line note naming what was attached — and the
 * bytes are spliced onto the last human message here, on the way to the
 * provider, exactly as `fenceUntrustedMessages` splices in its delimiters.
 *
 * Two problems are avoided by doing it here rather than upstream. The
 * checkpoint would otherwise carry a base64 copy of every file ever attached
 * to the thread, forever, in every saved version of the state — a 10 MB PDF
 * becomes tens of megabytes of `checkpoint_blobs`. And every later turn would
 * re-send those files to the provider, paying image and document tokens again
 * on each one. Older attachments stay as their text note, which keeps the
 * conversation readable ("the chart you sent" still resolves) at no cost.
 *
 * A turn with no attachments returns the messages untouched.
 */
function hydrateLatestAttachments(messages: BaseMessage[], turnId: TurnId): BaseMessage[] {
  const record = findTurn(turnId);
  if (!record || record.attachmentBlocks.length === 0) return messages;

  const lastHumanIndex = messages.findLastIndex((message) => HumanMessage.isInstance(message));
  const lastHuman = messages[lastHumanIndex];
  if (lastHumanIndex === -1 || lastHuman === undefined) return messages;

  const text =
    typeof lastHuman.content === "string"
      ? lastHuman.content
      : lastHuman.content.map((block) => (block.type === "text" ? block.text : "")).join("");

  const hydrated = new HumanMessage({
    content: [
      ...(text.trim().length > 0 ? [{ type: "text" as const, text }] : []),
      ...record.attachmentBlocks,
      ...(record.unavailableAttachments.length === 0
        ? []
        : [
            {
              type: "text" as const,
              text: `[These attachments could not be read: ${record.unavailableAttachments.join(", ")}]`,
            },
          ]),
    ],
  });

  return messages.with(lastHumanIndex, hydrated);
}

const llmCall: GraphNode<typeof MessagesState> = async (state, runtime) => {
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

  const formattedSystemPrompt = await BASE_SYSTEM_PROMPT_TEMPLATE.format({
    // Memories are derived from user messages, so they are untrusted for the
    // same reason tool output is, and carry the same fence.
    user_details_content: fenceUserMemories(context.memoriesContent),
  });

  const startedAt = Date.now();

  // Annotated because `getDynamicModel` returns a union of three provider
  // clients, and the union of their `invoke` results intersects to `never` —
  // every provider resolves to an `AIMessageChunk`, so that is the true type
  // of the value here and the one the rest of the node reads.
  const response: AIMessageChunk = await modelWithTools
    // Fenced on the way to the model only. `state.messages` keeps the exact
    // tool JSON, which is what the gen-UI cards parse and what the checkpoint
    // stores; only the model's view is delimited. Attachments are added here
    // for the same reason — see `hydrateLatestAttachments`.
    .invoke([
      new SystemMessage(formattedSystemPrompt),
      ...hydrateLatestAttachments(fenceUntrustedMessages(state.messages), context.turnId),
    ])
    .catch((error: unknown) => {
      log.error("llm.call_failed", { latencyMs: Date.now() - startedAt }, error);
      throw error;
    });

  const usage = usageMetadataSchema.parse(response.usage_metadata);
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? 0;

  log.info("llm.call_completed", {
    latencyMs: Date.now() - startedAt,
    inputTokens,
    outputTokens,
    totalTokens,
    toolCalls: response.tool_calls?.length ?? 0,
  });

  // Recorded, not written. The turn's message is assembled from the stream and
  // committed once, when that stream settles — see `server/chat/turn-commit.ts`.
  // A tool loop re-enters this node, so usage accumulates across steps.
  recordTurnUsage(context.turnId, { modelId, inputTokens, outputTokens });

  waitUntil(
    ingestModelUsage(
      {
        userId: context.userId,
        model: modelId,
        requestId: context.requestId,
        llmCallId,
        inputTokens,
        outputTokens,
        totalTokens,
      },
      log,
    ),
  );

  // The local counterpart of the Polar ingest above. Polar stays the billing
  // record; this is what `assertWithinQuota` reads, so enforcement no longer
  // depends on a vendor round trip. Tokens are recorded, never enforced — the
  // quota gate counts messages — so attributing a turn that straddles midnight
  // on the first to the period it finished in is accurate enough.
  waitUntil(
    recordQuotaTokens(
      {
        userId: context.userId,
        periodStart: usagePeriodFor(new Date()).start,
        inputTokens,
        outputTokens,
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
const toolNodeResultSchema = z.object({
  messages: z.array(z.custom<BaseMessage>(isBaseMessage)),
});
const runTools: GraphNode<typeof MessagesState> = async (state, runtime) => {
  // Tool results are no longer written here. They reach the database through
  // the stream, as `tool-output-available` chunks the turn recorder folds into
  // the assistant message — which is why a stopped turn can no longer leave a
  // tool call stuck at `input-available` with nothing to resolve it.
  return toolNodeResultSchema.parse(await toolNode.invoke(state, runtime));
};

export const agent = new StateGraph(MessagesState)
  .addNode("callLlm", llmCall)
  .addNode("tools", runTools)
  .addEdge(START, "callLlm")
  .addConditionalEdges("callLlm", shouldContinue, {
    __end__: END,
    tools: "tools",
  })
  .addEdge("tools", "callLlm")
  .compile({ checkpointer, store });
