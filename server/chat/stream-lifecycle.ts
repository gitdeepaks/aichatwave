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
