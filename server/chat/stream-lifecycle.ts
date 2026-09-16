/**
 * Running a callback when a response stream settles.
 *
 * A concurrent-stream lease has to be released on every exit a stream has, and
 * a stream has three: it ends, it errors, or the client navigates away and the
 * body is cancelled. The last one is the common case in a chat UI and the one
 * a `try/finally` around the handler never sees — the handler returned long
 * before, while the body was still being read.
 *
 * Written as an explicit reader/pump rather than `pipeThrough(new
 * TransformStream({ flush, cancel }))` because `cancel` on a transformer is a
 * recent spec addition that the DOM lib types in this project do not describe,
 * and the project forbids type assertions.
 */

export type StreamOutcome = "completed" | "failed" | "aborted";

/**
 * Wraps `source` so `onSettled` runs exactly once, whichever way it ends.
 *
 * `onSettled` is fire-and-forget on purpose: it is cleanup, and awaiting it
 * would hold the stream open on the very path where the client has already
 * left. It must not throw — `releaseChatStreamSlot` swallows its own errors
 * for that reason.
 */
export function onStreamSettled<TChunk>(
  source: ReadableStream<TChunk>,
  onSettled: (outcome: StreamOutcome) => void,
): ReadableStream<TChunk> {
  const reader = source.getReader();
  let settled = false;

  const settle = (outcome: StreamOutcome): void => {
    if (settled) return;
    settled = true;
    onSettled(outcome);
  };

  return new ReadableStream<TChunk>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          settle("completed");
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        settle("failed");
        controller.error(error);
      }
    },

    async cancel(reason) {
      settle("aborted");
      await reader.cancel(reason);
    },
  });
}

/**
 * Observes every chunk without buffering or changing the stream.
 *
 * This is where the turn recorder is fed. The observer runs on the typed
 * chunks, before they are encoded as SSE, so accumulating the assistant's
 * message is a matter of reading a discriminated union rather than re-parsing
 * the wire format the client receives.
 *
 * `observe` must not throw: it is bookkeeping alongside delivery, and a
 * failure to record must never take down the answer being delivered.
 */
export function onEachChunk<TChunk>(
  source: ReadableStream<TChunk>,
  observe: (chunk: TChunk) => void,
): ReadableStream<TChunk> {
  const reader = source.getReader();

  return new ReadableStream<TChunk>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      observe(value);
      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

/**
 * Appends chunks produced at close time, after the source is exhausted.
 *
 * Used to emit the turn's `message-metadata` — the model and its token counts
 * — which is only knowable once the last provider call has reported usage. The
 * factory runs on the normal end of the stream only: on cancel there is no
 * client left to send anything to, and on error the error is the last word.
 */
export function withTrailingChunks<TChunk>(
  source: ReadableStream<TChunk>,
  trailing: () => TChunk[],
): ReadableStream<TChunk> {
  const reader = source.getReader();
  let drained = false;

  return new ReadableStream<TChunk>({
    async pull(controller) {
      if (drained) {
        controller.close();
        return;
      }

      const { done, value } = await reader.read();
      if (done) {
        drained = true;
        for (const chunk of trailing()) controller.enqueue(chunk);
        controller.close();
        return;
      }
      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

/** Observes delivery without buffering or changing the stream's chunks. */
export function onFirstMatchingChunk<TChunk>(
  source: ReadableStream<TChunk>,
  predicate: (chunk: TChunk) => boolean,
  callback: () => void,
): ReadableStream<TChunk> {
  const reader = source.getReader();
  let seen = false;

  return new ReadableStream<TChunk>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      if (!seen && predicate(value)) {
        seen = true;
        callback();
      }
      controller.enqueue(value);
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}
