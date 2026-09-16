/**
 * Making a chat stream survive the connection that started it.
 *
 * Refreshing mid-answer used to lose the response permanently: the tokens had
 * been paid for, the model was still generating, and the only copy was in a
 * `fetch` the browser had just torn down. This module is the second copy.
 *
 * What is stored is the Server-Sent Events text itself, taken from the tee the
 * AI SDK offers through `consumeSseStream`, not a parsed representation of it.
 * Replay is then a byte copy that the SDK's transport parses exactly as it
 * parses a live response — so a chunk type this app has never heard of still
 * survives a reload, and an SDK upgrade cannot quietly drop one.
 *
 * Writes are batched. A token-level delta arrives every few milliseconds and a
 * row per delta would put thousands of inserts behind every answer; a batch
 * every `FLUSH_INTERVAL_MS` or `FLUSH_CHAR_THRESHOLD` characters bounds that to
 * a few writes a second while keeping a reconnecting reader close to live.
 */

import type { ChatStreamState } from "@/lib/chat/stream-state";
import {
  appendChatStreamChunk,
  listChatStreamChunks,
  readChatStreamState,
  settleChatStream,
} from "@/server/db/chat-stream-repository";
import { isSettledStreamState, STREAM_HEARTBEAT_TIMEOUT_MS } from "@/lib/chat/stream-state";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

const FLUSH_INTERVAL_MS = 250;
const FLUSH_CHAR_THRESHOLD = 2048;
/** How often a reconnected reader looks for batches it has not seen. */
const REPLAY_POLL_INTERVAL_MS = 200;
/** Batches read per poll. Bounds memory when catching up on a long answer. */
const REPLAY_PAGE_SIZE = 64;

/**
 * Drains the SSE tee into `chat_stream_chunk`.
 *
 * Returns a promise that resolves when the tee is exhausted — which happens
 * whether the stream completed, errored, or the client went away, because the
 * tee is fed by the same source in every case.
 *
 * The tee applies backpressure: an unread branch eventually stalls the branch
 * the client is reading. That is why this drains unconditionally and why a
 * write failure degrades to "stop buffering" rather than to "stop reading" —
 * losing resumability is recoverable, stalling the live answer is not.
 */
export async function bufferStreamToDatabase(params: {
  streamId: string;
  stream: ReadableStream<string>;
  /**
   * Stops generation when someone else marked this stream aborted.
   *
   * A stop request can land on a different instance than the one producing the
   * answer. That instance can only set a flag; this flush loop is what turns
   * the flag into an actual abort, within one flush interval, on the instance
   * that holds the provider call.
   */
  onExternalAbort?: () => void;
  /**
   * Whether this instance has already recorded the stream's end.
   *
   * Without it the last flush misreads its own settle as someone else's stop:
   * the row stops being `streaming` the moment we mark it completed, and the
   * flush that follows — there is always one, draining what the final chunks
   * left pending — would see "no longer live" and report an abort on a turn
   * that finished normally.
   */
  isSettledLocally?: () => boolean;
  log?: Logger;
}): Promise<void> {
  const log = params.log ?? rootLogger;
  const reader = params.stream.getReader();

  let seq = 0;
  let pending = "";
  let pendingSince = Date.now();
  let buffering = true;
  let noticedAbort = false;

  const flush = async (): Promise<void> => {
    if (!buffering || pending.length === 0) return;
    const payload = pending;
    const batchSeq = seq;
    pending = "";
    seq += 1;
    pendingSince = Date.now();

    try {
      const written = await appendChatStreamChunk({
        streamId: params.streamId,
        seq: batchSeq,
        payload,
        at: new Date(),
      });

      // `appendChatStreamChunk` only bumps the heartbeat of a row that is
      // still streaming, so "no row updated" is how this instance learns the
      // turn was stopped elsewhere.
      if (!written && !noticedAbort && params.isSettledLocally?.() !== true) {
        noticedAbort = true;
        log.info("chat.stream_external_abort", { streamId: params.streamId });
        params.onExternalAbort?.();
      }
    } catch (error) {
      buffering = false;
      log.error("chat.stream_buffer_failed", { streamId: params.streamId, seq: batchSeq }, error);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!buffering) continue;

      pending += value;
      if (
        pending.length >= FLUSH_CHAR_THRESHOLD ||
        Date.now() - pendingSince >= FLUSH_INTERVAL_MS
      ) {
        await flush();
      }
    }
    await flush();
  } catch (error) {
    log.warn("chat.stream_buffer_read_failed", { streamId: params.streamId }, error);
    await flush();
  } finally {
    reader.releaseLock();
  }
}

/** Records how a stream ended. Never throws — it runs on the cleanup path. */
export async function markStreamSettled(params: {
  streamId: string;
  state: ChatStreamState;
  log?: Logger;
}): Promise<void> {
  const log = params.log ?? rootLogger;
  try {
    await settleChatStream({ streamId: params.streamId, state: params.state, at: new Date() });
  } catch (error) {
    log.error("chat.stream_settle_failed", { streamId: params.streamId }, error);
  }
}

/**
 * Replays a stream from the beginning and then follows it to its end.
 *
 * Emits every batch already written, then polls for more until the row reports
 * a settled state — or until its heartbeat goes stale, which is how a stream
 * whose process died is distinguished from one that is merely slow. Either way
 * the returned stream closes rather than hanging, because a reconnecting
 * client that never sees an end shows a spinner forever.
 */
export function replayStream(params: {
  streamId: string;
  log?: Logger;
}): ReadableStream<Uint8Array> {
  const log = params.log ?? rootLogger;
  const encoder = new TextEncoder();
  let afterSeq = -1;
  let closed = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed) return;

      try {
        for (;;) {
          const batches = await listChatStreamChunks({
            streamId: params.streamId,
            afterSeq,
            limit: REPLAY_PAGE_SIZE,
          });

          if (batches.length > 0) {
            for (const batch of batches) {
              controller.enqueue(encoder.encode(batch.payload));
              afterSeq = batch.seq;
            }
            return;
          }

          const current = await readChatStreamState(params.streamId);
          if (current === null || isSettledStreamState(current.state)) {
            closed = true;
            controller.close();
            return;
          }

          if (Date.now() - current.heartbeatAt.getTime() > STREAM_HEARTBEAT_TIMEOUT_MS) {
            log.warn("chat.stream_replay_stale", { streamId: params.streamId });
            closed = true;
            controller.close();
            return;
          }

          await sleep(REPLAY_POLL_INTERVAL_MS);
        }
      } catch (error) {
        log.error("chat.stream_replay_failed", { streamId: params.streamId }, error);
        closed = true;
        controller.close();
      }
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
