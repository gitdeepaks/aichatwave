/**
 * Chat service: thread creation, ownership checks, and message orchestration.
 * Route handlers and pages call this service instead of touching the database
 * or the agent graph directly.
 */

import { randomUUID } from "node:crypto";
import { HumanMessage } from "@langchain/core/messages";
import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { toUIMessageStream } from "@ai-sdk/langchain";
import { ensureUserProvisioned } from "@/server/auth/user-service";
import { agent } from "@/server/chat/agent";
import { toChatRuntimeContext } from "@/server/chat/runtime-context";
import { deriveThreadTitle } from "@/server/chat/thread-title";
import { maybeTitleThread } from "@/server/chat/title-generation";
import {
  onEachChunk,
  onFirstMatchingChunk,
  onStreamSettled,
  withTrailingChunks,
  type StreamOutcome,
} from "@/server/chat/stream-lifecycle";
import {
  describeAttachments,
  loadAttachmentBlocks,
  resolveTurnAttachments,
  shouldSweepAttachments,
  sweepAttachments,
  toFilePart,
} from "@/server/chat/attachment-service";
import { bufferStreamToDatabase, markStreamSettled } from "@/server/chat/stream-buffer";
import { accumulatedText, recordChunk } from "@/server/chat/turn-recorder";
import { commitTurn } from "@/server/chat/turn-commit";
import { createTurnId, registerTurn, releaseTurn } from "@/server/chat/turn-registry";
import { createChatStream, markChatStreamFirstToken } from "@/server/db/chat-stream-repository";
import { endTurnSpan, startTurnSpan } from "@/server/observability/turn-trace";
import { langsmithRunConfig } from "@/server/observability/langsmith";
import { reportError } from "@/server/observability/error-reporter";
import { assertModelAccess, resolvePlan } from "@/server/billing/subscription-service";
import { assertWithinQuota, refundQuota } from "@/server/billing/quota-service";
import {
  acquireChatStreamSlot,
  assertWithinRateLimit,
  maybeSweepRateLimits,
  releaseChatStreamSlot,
} from "@/server/security/rate-limit";
import { assertModelAvailable } from "@/server/ai/model-service";
import { MAX_TURN_DURATION_MS } from "@/lib/billing/plan-policy";
import * as threadRepository from "@/server/db/thread-repository";
import { AppError } from "@/server/lib/app-error";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";
import type { ChatMessageMetadata } from "@/lib/chat/ui-message";
import type { ChatStreamState } from "@/lib/chat/stream-state";
import type { ModelId } from "@/lib/ai/model-registry";
import { waitUntil } from "@vercel/functions";
import { extractAndStoreMemories, getMemoriesPromptContent } from "@/server/memory/memory-service";
import { assertAccountActive } from "@/server/account/account-deletion-service";

/**
 * Creates the thread on first message, or verifies ownership of an existing
 * one. Throws a typed 403 when the thread belongs to someone else.
 */
export async function ensureThreadAccess(params: {
  userId: string;
  threadId: string;
  messageContent: string;
  log?: Logger;
}): Promise<boolean> {
  const { userId, threadId, messageContent } = params;
  const log = params.log ?? rootLogger;

  const owned = await threadRepository.findThreadForUser({ threadId, userId });
  if (owned) return false;

  if (await threadRepository.threadExists(threadId)) {
    throw new AppError("FORBIDDEN", "You don't have access to this thread.");
  }

  // `thread.user_id` references `user.id`, and Clerk's `user.created` webhook is
  // asynchronous — a user who signs up and immediately sends a message can beat
  // it here. Provision on the write path so the foreign key always holds.
  await ensureUserProvisioned(userId, log);

  await threadRepository.createThread({
    id: threadId,
    title: deriveThreadTitle(messageContent),
    userId,
  });
  log.info("chat.thread_created", { threadId, userId });
  return true;
}

export type StreamChatParams = {
  userId: string;
  threadId: string;
  messageContent: string;
  selectedModel: ModelId;
  requestId: string;
  /** Null when no proxy header carried one; the per-IP limit is then skipped. */
  clientIp: string | null;
  /** Attachment ids the composer uploaded for this turn, in display order. */
  attachmentIds: string[];
  /** Redo the last answer instead of adding a turn. See `commitTurn`. */
  regenerate: boolean;
};

/** Maps a stream's outcome onto the durable state the reconnect endpoint reads. */
function toStreamState(outcome: StreamOutcome): Exclude<ChatStreamState, "streaming"> {
  switch (outcome) {
    case "completed":
      return "completed";
    case "aborted":
      return "aborted";
    case "failed":
      return "failed";
  }
}

/**
 * Full chat message orchestration.
 *
 * The order of the gates is the design, not an accident. Each one is cheaper
 * than the next and rejects a class of request the later ones would have paid
 * to discover:
 *
 *  1. **rate limit** — two indexed upserts, no writes to domain tables. A
 *     burst is refused before it can create a thread or provision a user.
 *  2. **stream slot** — bounds how much in-flight work one account can hold.
 *     Taken before the pre-LLM work (ownership read, memory read, extraction
 *     call) because that work is itself worth containing.
 *  3. **thread access** — ownership, and user provisioning on first message.
 *  4. **availability** then **plan access** — a 503 an operator owns before a
 *     403 the user can fix by upgrading, so an unconfigured provider never
 *     reads as a billing problem.
 *  5. **attachments** — ownership and model capability, before anything is
 *     spent; an unreadable attachment is a 4xx, not a wasted turn.
 *  6. **quota** — the last gate and the only one that reserves something, so
 *     nothing is spent on a turn that a cheaper gate would have refused.
 *
 * Everything after the slot is acquired runs inside a `try` that releases the
 * slot and refunds the reservation, so a failure never leaks either.
 *
 * ## The stream pipeline
 *
 * The returned body passes through four wrappers, innermost first:
 *
 *  - `onEachChunk` feeds the turn recorder, which is what the turn is written
 *    from when it settles;
 *  - `withTrailingChunks` appends the turn's `message-metadata` — the model
 *    and its token counts — which is only knowable after the last provider
 *    call;
 *  - `onStreamSettled` releases the slot, commits the turn, and records how the
 *    stream ended, on every one of the three ways a stream can end;
 *  - `onFirstMatchingChunk` reports time-to-first-token.
 *
 * `consumeSseStream` takes a tee of the encoded output into `chat_stream_chunk`,
 * which is what a reload reconnects to.
 */
export async function streamChat(params: StreamChatParams): Promise<Response> {
  const requestStartedAt = performance.now();
  const { messageContent, clientIp, attachmentIds, regenerate } = params;
  const { userId, threadId, selectedModel, requestId } = params;
  const log = rootLogger.child({ requestId, userId, threadId, modelId: selectedModel });
  const now = new Date();

  await assertAccountActive(userId);

  // The plan decides the limits, so it has to be known before the first gate.
  // A warm read is local and costs no Polar call; a stale one is served locally
  // and reconciled behind the response.
  const { resolution, refresh } = await resolvePlan(userId, log);
  if (refresh !== null) waitUntil(refresh());

  await assertWithinRateLimit({
    userId,
    planId: resolution.planId,
    clientIp,
    now,
    log,
  });
  waitUntil(maybeSweepRateLimits(now, log));

  const lease = await acquireChatStreamSlot({ userId, planId: resolution.planId, now, log });
  let reservation: Awaited<ReturnType<typeof assertWithinQuota>> | null = null;

  try {
    const createdThread = await ensureThreadAccess({ userId, threadId, messageContent, log });
    // Availability (is this deployment configured for the model?) before access
    // (does the user's plan include it?): the first is a 503 an operator owns,
    // the second a 403 the user can resolve by upgrading. Checking availability
    // first keeps an unconfigured provider from reading as a billing problem.
    assertModelAvailable(selectedModel);
    assertModelAccess(resolution.planId, selectedModel);

    const attachments = await resolveTurnAttachments({
      attachmentIds,
      userId,
      modelId: selectedModel,
    });

    reservation = await assertWithinQuota({ userId, planId: resolution.planId, now, log });

    const memoryStartedAt = performance.now();
    const [memoriesContent, attachmentPayload] = await Promise.all([
      getMemoriesPromptContent({ userId, query: messageContent }, log),
      loadAttachmentBlocks({ records: attachments, userId, log }),
    ]);
    const memoryLookupMs = Math.round(performance.now() - memoryStartedAt);

    const turnId = createTurnId();
    const streamId = randomUUID();

    const record = registerTurn(turnId, {
      streamId,
      threadId,
      userId,
      userText: messageContent,
      attachments,
      attachmentBlocks: attachmentPayload.blocks,
      unavailableAttachments: attachmentPayload.unavailable,
      replacePrevious: regenerate,
      modelId: selectedModel,
    });

    // Written before the graph runs, and the reason the user's message no
    // longer has to be: this row is the durable record of the turn's input as
    // well as the anchor a reload reconnects to.
    await createChatStream({
      id: streamId,
      threadId,
      userId,
      modelId: selectedModel,
      userText: messageContent,
      attachmentIds: attachments.map((attachment) => attachment.id),
    });

    // Parsed once before graph entry: every id is branded and memory context is
    // fixed for the turn, so tool loops do not repeat the embedding lookup.
    const context = toChatRuntimeContext({
      userId,
      threadId,
      requestId,
      turnId,
      selectedModel,
      memoriesContent,
    });

    // Opened before the graph so every node, provider call and tool hangs off
    // one span for the turn — and closed in `onStreamSettled` below, because a
    // turn outlives the request that started it and no `finally` here would
    // ever run at the right moment.
    const traceId = startTurnSpan({
      turnId,
      attributes: {
        "app.request_id": requestId,
        "app.user_id": userId,
        "app.thread_id": threadId,
        "chat.stream_id": streamId,
        "chat.model.requested": selectedModel,
        "chat.attachments": attachments.length,
        "chat.regenerate": regenerate,
        "billing.plan_id": resolution.planId,
      },
    });

    const stream = await agent.streamEvents(
      { messages: [new HumanMessage(userMessageForGraph(params, attachments))] },
      {
        configurable: { thread_id: threadId },
        version: "v2",
        context,
        // Carries this turn's ids into LangSmith, when LangSmith is on. Without
        // them a traced run shows the prompt and the answer and connects to
        // nothing else in the system — see `server/observability/langsmith.ts`.
        ...langsmithRunConfig({
          requestId,
          userId,
          threadId,
          turnId,
          modelId: selectedModel,
          planId: resolution.planId,
        }),
        // The turn's own signal, not the request's. Next aborts the request
        // signal whenever the client disconnects, and a page refresh is a
        // disconnect — using it here would tear the answer down at exactly the
        // moment the buffer exists to preserve it. Stop is explicit instead:
        // `DELETE /api/chat/[threadId]/stream` aborts this controller.
        signal: record.abortController.signal,
      },
    );

    waitUntil(
      extractAndStoreMemories({
        userId,
        messageContent,
        existingMemoriesContent: memoriesContent,
        log,
      }),
    );

    log.info("chat.stream_started", {
      planId: resolution.planId,
      planSource: resolution.source,
      quotaUsed: reservation.snapshot.used,
      quotaLimit: reservation.snapshot.limit,
      streamSlot: lease.slot,
      createdThread,
      regenerate,
      attachments: attachments.length,
      streamId,
      memoryLookupMs,
      preStreamMs: Math.round(performance.now() - requestStartedAt),
      // Null when no tracing backend is configured. Present, it is the other
      // half of the exit criterion: a user quotes a request id, this line
      // names the trace that explains it.
      traceId,
    });

    // A turn that outlives its client keeps generating so a reload can rejoin
    // it, which means nothing else will ever stop a stalled one. This does.
    const deadline = setTimeout(() => {
      log.warn("chat.turn_deadline_exceeded", { streamId, maxMs: MAX_TURN_DURATION_MS });
      record.abortController.abort(new Error("The turn exceeded its time limit."));
    }, MAX_TURN_DURATION_MS);
    // `unref` so a pending deadline cannot keep a serverless invocation alive
    // past the work it was scheduled to bound.
    deadline.unref();

    const settledSlot = { released: false };
    // Read by the buffer, which must not mistake our own settle for a stop
    // someone else requested on another instance.
    const settledLocally = { value: false };

    return createUIMessageStreamResponse({
      stream: onFirstMatchingChunk(
        onStreamSettled(
          withTrailingChunks(
            onEachChunk(toUIMessageStream(stream), (chunk) => {
              recordChunk(record.accumulator, chunk);
            }),
            () => [turnMetadataChunk(record.modelId, record.usage)],
          ),
          (outcome) => {
            // The slot is held for as long as the answer is actually streaming,
            // and freed the moment it stops — including when the user navigates
            // away mid-answer, which a `finally` around this function would
            // never see.
            if (!settledSlot.released) {
              settledSlot.released = true;
              waitUntil(releaseChatStreamSlot(lease, log));
            }

            // A stop surfaces as a provider abort, which the generic
            // machinery reads as a failure. The controller is the authority on
            // whether it was deliberate.
            clearTimeout(deadline);
            settledLocally.value = true;
            const state = record.abortController.signal.aborted
              ? "aborted"
              : toStreamState(outcome);
            log.info("chat.stream_settled", { outcome, streamSlot: lease.slot, streamId });
            endTurnSpan({
              turnId,
              outcome:
                state === "completed" ? "completed" : state === "aborted" ? "aborted" : "failed",
              attributes: {
                "chat.model.answered": record.modelId,
                "chat.usage.input_tokens": record.usage.inputTokens,
                "chat.usage.output_tokens": record.usage.outputTokens,
                "chat.duration_ms": Math.round(performance.now() - requestStartedAt),
              },
            });
            waitUntil(
              finalizeTurn({
                turnId,
                state,
                createdThread,
                log,
              }),
            );
          },
        ),
        (chunk) => chunk.type === "text-delta" && chunk.delta.trim().length > 0,
        () => {
          log.info("chat.first_token", {
            timeToFirstTokenMs: Math.round(performance.now() - requestStartedAt),
          });
          // Also written to the row, because the p95 of this number is an SLO
          // and an SLO computed from one process's memory is a different
          // figure on every instance. `waitUntil` keeps the write off the path
          // of the token the user is waiting for.
          waitUntil(
            markChatStreamFirstToken({ streamId, at: new Date() }).catch((error: unknown) => {
              log.warn("chat.first_token_write_failed", { streamId }, error);
            }),
          );
        },
      ),
      consumeSseStream: ({ stream: sseStream }) => {
        waitUntil(
          bufferStreamToDatabase({
            streamId,
            stream: sseStream,
            onExternalAbort: () => record.abortController.abort(new Error("Stopped by the user.")),
            isSettledLocally: () => settledLocally.value,
            log,
          }),
        );
      },
      headers: {
        "x-request-id": requestId,
        // Lets the composer show remaining messages without a second request.
        "x-quota-remaining": String(reservation.snapshot.remaining),
        "x-quota-limit": String(reservation.snapshot.limit),
        "x-stream-id": streamId,
      },
    });
  } catch (error) {
    // Nothing streamed, so nothing was spent: give the allowance back and free
    // the slot immediately rather than waiting out the lease TTL.
    if (reservation !== null) await refundQuota(reservation, log);
    await releaseChatStreamSlot(lease, log);
    // Reported here as well as in the route wrapper because a pre-stream
    // failure is the one a user notices most — the answer never starts — and
    // the classifier drops the 4xx half of these anyway.
    reportError({ error, log, context: { requestId, userId, threadId, route: "streamChat" } });
    throw error;
  }
}

/**
 * Everything that happens once a turn is over: write it, mark the stream
 * settled, title the thread, and drop the in-process record.
 *
 * Ordered so the message exists before anything reads it. The title generator
 * runs last because it makes a second model call and must not delay the commit.
 */
async function finalizeTurn(params: {
  turnId: ReturnType<typeof createTurnId>;
  state: ChatStreamState;
  createdThread: boolean;
  log: Logger;
}): Promise<void> {
  const record = releaseTurn(params.turnId);
  if (record === null) return;

  await commitTurn({ record, outcome: params.state, log: params.log });
  await markStreamSettled({ streamId: record.streamId, state: params.state, log: params.log });

  if (shouldSweepAttachments()) {
    await sweepAttachments(new Date(), params.log);
  }

  if (!params.createdThread || params.state !== "completed") return;

  await maybeTitleThread({
    threadId: record.threadId,
    userId: record.userId,
    userMessage: record.userText,
    assistantMessage: accumulatedText(record.accumulator),
    log: params.log,
  });
}

/**
 * The turn's attribution, emitted as the stream's last chunk.
 *
 * Sent rather than inferred on the client because the client knows which model
 * it *asked* for, not which one answered or what it cost. The same shape is
 * rebuilt from the database when history is read back, so an answer looks
 * identical before and after a reload.
 */
function turnMetadataChunk(
  modelId: ModelId,
  usage: { inputTokens: number; outputTokens: number },
): UIMessageChunk {
  const metadata: ChatMessageMetadata = {
    modelId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    createdAt: new Date().toISOString(),
  };
  return { type: "message-metadata", messageMetadata: metadata };
}

/**
 * What the graph sees as the user's message.
 *
 * Attachments enter as a text note, not as bytes — the bytes are spliced onto
 * this message inside `llmCall`, on the way to the provider only. See
 * `hydrateLatestAttachments` in `server/chat/agent.ts` for why the checkpoint
 * must not carry them.
 */
function userMessageForGraph(
  params: Pick<StreamChatParams, "messageContent">,
  attachments: Parameters<typeof toFilePart>[0][],
): string {
  if (attachments.length === 0) return params.messageContent;
  return [params.messageContent, describeAttachments(attachments.map(toFilePart))]
    .filter((line) => line.length > 0)
    .join("\n\n");
}
