import assert from "node:assert/strict";
import test from "node:test";
import { onEachChunk, withTrailingChunks } from "@/server/chat/stream-lifecycle";

function streamOf<T>(values: T[]): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      for (const value of values) controller.enqueue(value);
      controller.close();
    },
  });
}

/**
 * Read with an explicit reader rather than `for await`: the DOM lib types in
 * this project do not describe `ReadableStream` as async-iterable, and the
 * production code avoids that same gap the same way.
 */
async function drain<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const out: T[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

test("onEachChunk observes every chunk and changes none of them", async () => {
  const seen: number[] = [];
  const delivered = await drain(onEachChunk(streamOf([1, 2, 3]), (n) => seen.push(n)));

  assert.deepEqual(seen, [1, 2, 3]);
  assert.deepEqual(delivered, [1, 2, 3]);
});

test("onEachChunk stops observing when the reader goes away", async () => {
  const seen: number[] = [];
  const stream = onEachChunk(streamOf([1, 2, 3]), (n) => seen.push(n));

  const reader = stream.getReader();
  await reader.read();
  await reader.cancel("client left");

  assert.deepEqual(seen, [1]);
});

test("withTrailingChunks appends after the source is exhausted, not before", async () => {
  const delivered = await drain(withTrailingChunks(streamOf(["a", "b"]), () => ["meta"]));

  assert.deepEqual(delivered, ["a", "b", "meta"]);
});

test("the trailing factory runs once, and only at the end", async () => {
  let calls = 0;
  await drain(
    withTrailingChunks(streamOf([1, 2, 3]), () => {
      calls += 1;
      return [99];
    }),
  );

  assert.equal(calls, 1);
});

/**
 * The metadata chunk carries the turn's token counts, which are only known
 * after the last provider call. Reading them at close time rather than at
 * wrap time is what makes the figure the client shows the real one.
 */
test("the trailing factory is evaluated at close, so it sees final state", async () => {
  const usage = { outputTokens: 0 };
  const stream = withTrailingChunks(streamOf([1, 2]), () => [usage.outputTokens]);

  usage.outputTokens = 512;
  const delivered = await drain(stream);

  assert.deepEqual(delivered, [1, 2, 512]);
});

test("a cancelled stream appends nothing — there is no client left to tell", async () => {
  let calls = 0;
  const stream = withTrailingChunks(streamOf([1, 2, 3]), () => {
    calls += 1;
    return [99];
  });

  const reader = stream.getReader();
  await reader.read();
  await reader.cancel("client left");

  assert.equal(calls, 0);
});
