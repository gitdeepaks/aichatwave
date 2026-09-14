import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { onFirstMatchingChunk, onStreamSettled } from "@/server/chat/stream-lifecycle";

describe("onFirstMatchingChunk", () => {
  it("observes only the first matching chunk without changing output", async () => {
    let calls = 0;
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("first");
        controller.enqueue("second");
        controller.close();
      },
    });

    const chunks: string[] = [];
    const reader = onFirstMatchingChunk(
      source,
      (chunk) => chunk === "second",
      () => calls++,
    ).getReader();
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
    }

    assert.deepEqual(chunks, ["first", "second"]);
    assert.equal(calls, 1);
  });

  it("does not report a chunk for an empty stream", async () => {
    let calls = 0;
    const source = new ReadableStream<string>({
      start(controller) {
        controller.close();
      },
    });

    const result = await onFirstMatchingChunk(
      source,
      () => true,
      () => calls++,
    )
      .getReader()
      .read();
    assert.equal(result.done, true);
    assert.equal(calls, 0);
  });
});

describe("stream observer composition", () => {
  it("reports completion and the first match exactly once", async () => {
    const outcomes: string[] = [];
    let matches = 0;
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("control");
        controller.enqueue("text");
        controller.enqueue("text");
        controller.close();
      },
    });
    const reader = onFirstMatchingChunk(
      onStreamSettled(source, (outcome) => outcomes.push(outcome)),
      (chunk) => chunk === "text",
      () => matches++,
    ).getReader();

    while (!(await reader.read()).done) {
      // Drain the stream to trigger completion.
    }

    assert.deepEqual(outcomes, ["completed"]);
    assert.equal(matches, 1);
  });

  it("preserves failure settlement", async () => {
    const outcomes: string[] = [];
    const source = new ReadableStream<string>({
      pull() {
        throw new Error("stream failed");
      },
    });
    const reader = onFirstMatchingChunk(
      onStreamSettled(source, (outcome) => outcomes.push(outcome)),
      () => true,
      () => assert.fail("failed stream matched"),
    ).getReader();

    await assert.rejects(() => reader.read(), /stream failed/);
    assert.deepEqual(outcomes, ["failed"]);
  });

  it("preserves cancellation settlement", async () => {
    const outcomes: string[] = [];
    const source = new ReadableStream<string>({
      pull(controller) {
        controller.enqueue("control");
      },
    });
    const reader = onFirstMatchingChunk(
      onStreamSettled(source, (outcome) => outcomes.push(outcome)),
      () => false,
      () => assert.fail("non-matching stream matched"),
    ).getReader();

    await reader.read();
    await reader.cancel();
    assert.deepEqual(outcomes, ["aborted"]);
  });
});
