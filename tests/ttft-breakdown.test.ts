/**
 * "A TTFT breakdown exists as a trace, with each segment named, so the next
 * person optimising it is not guessing either" — Phase L's exit criterion for
 * item 4, and the reason this module exists at all.
 *
 * So what is tested is the contract the breakdown makes with its readers: the
 * segments it reports are named, each name appears in both the span attributes
 * and the log fields under the spelling an operator is told to grep for, and a
 * gate that *throws* is still attributed — because the slow gate that rejects
 * is precisely the one worth finding.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { startTurnSegmentTimer } from "@/server/chat/ttft-breakdown";

/** Resolves after at least `ms`, so a measured segment is measurably non-zero. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("a measured segment is attributed under its own name", async () => {
  const segments = startTurnSegmentTimer();

  await segments.measure("memory_lookup", () => delay(12));

  const attributes = segments.attributes();
  const recorded = attributes["chat.segment.memory_lookup_ms"];

  assert.equal(typeof recorded, "number");
  assert.ok(typeof recorded === "number" && recorded >= 10, "a 12ms segment should read ~12ms");
});

test("log fields keep the camelCase spelling the runbooks tell operators to grep for", async () => {
  const segments = startTurnSegmentTimer();

  await segments.measure("memory_lookup", () => delay(1));

  const fields = segments.fields();
  assert.ok("memoryLookupMs" in fields, "`memoryLookupMs` is what the SLO runbook names");
  assert.ok("preStreamMs" in fields, "`preStreamMs` has been on this log line since Phase A");
});

test("a segment that throws is still attributed", async () => {
  const segments = startTurnSegmentTimer();

  await assert.rejects(
    segments.measure("rate_limit", async () => {
      await delay(5);
      throw new Error("too fast");
    }),
    /too fast/,
  );

  assert.ok("rateLimitMs" in segments.fields(), "a rejecting gate is the one worth measuring");
});

test("a segment that runs twice reports the total, not the last one", async () => {
  const segments = startTurnSegmentTimer();

  await segments.measure("attachments", () => delay(10));
  await segments.measure("attachments", () => delay(10));

  const total = segments.attributes()["chat.segment.attachments_ms"];
  assert.ok(typeof total === "number" && total >= 18, "two 10ms passes should read ~20ms");
});

test("synchronous work is measurable too, and its value passes through", async () => {
  const segments = startTurnSegmentTimer();

  // `agent.streamEvents` returns its stream without awaiting anything, and the
  // setup before that is still on the path to the first token.
  const result = await segments.measure("graph_start", () => "stream");

  assert.equal(result, "stream");
  assert.ok("graphStartMs" in segments.fields());
});

test("a segment that never ran is absent rather than reported as zero", () => {
  const segments = startTurnSegmentTimer();

  assert.equal(segments.attributes()["chat.segment.quota_ms"], undefined);
  assert.ok("preStreamMs" in segments.fields());
});
