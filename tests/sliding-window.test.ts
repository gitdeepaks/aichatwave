import assert from "node:assert/strict";
import test from "node:test";
import {
  previousWindowWeight,
  retryAfterSeconds,
  weightedHits,
  windowBounds,
} from "@/lib/security/sliding-window";

const WINDOW = 60_000;

test("windows are aligned to the epoch, not to first contact", () => {
  const bounds = windowBounds(new Date("2026-09-11T12:34:17.500Z"), WINDOW);

  assert.equal(bounds.currentStart.toISOString(), "2026-09-11T12:34:00.000Z");
  assert.equal(bounds.previousStart.toISOString(), "2026-09-11T12:33:00.000Z");
  assert.equal(bounds.elapsedMs, 17_500);
});

test("two callers in the same second agree on the window", () => {
  const first = windowBounds(new Date("2026-09-11T12:34:00.001Z"), WINDOW);
  const second = windowBounds(new Date("2026-09-11T12:34:59.999Z"), WINDOW);

  assert.equal(first.currentStart.getTime(), second.currentStart.getTime());
});

test("the previous window decays linearly and is clamped at both ends", () => {
  assert.equal(previousWindowWeight(0, WINDOW), 1);
  assert.equal(previousWindowWeight(WINDOW / 2, WINDOW), 0.5);
  assert.equal(previousWindowWeight(WINDOW, WINDOW), 0);
  assert.equal(previousWindowWeight(WINDOW * 2, WINDOW), 0);
  assert.equal(previousWindowWeight(-1, WINDOW), 1);
});

test("the boundary burst a fixed window allows is counted here", () => {
  // 10 requests at the end of one window, 10 at the start of the next. A fixed
  // window sees two separate 10s; the sliding window sees ~19 and rejects.
  const counts = { previousHits: 10, currentHits: 10 };

  assert.equal(weightedHits(counts, 1_000, WINDOW), 10 + 10 * (59 / 60));
  assert.ok(weightedHits(counts, 1_000, WINDOW) > 10);
});

test("retry-after waits out the previous window's decay when only it is binding", () => {
  // limit 10, 6 used this window, 8 left over. Headroom is 4, so the previous
  // window must decay from 8 to under 4 — half of it — which is 30s in.
  const seconds = retryAfterSeconds({
    counts: { previousHits: 8, currentHits: 6 },
    limit: 10,
    windowMs: WINDOW,
    elapsedMs: 0,
  });

  assert.equal(seconds, 30);
});

test("retry-after spans into the next window when the current one alone is over", () => {
  // 20 hits already this window against a limit of 10: nothing helps until the
  // window rolls (30s left) and then decays to under the limit (another 30s).
  const seconds = retryAfterSeconds({
    counts: { previousHits: 0, currentHits: 20 },
    limit: 10,
    windowMs: WINDOW,
    elapsedMs: 30_000,
  });

  assert.equal(seconds, 60);
});

test("retry-after is never zero or negative", () => {
  const cases = [
    { counts: { previousHits: 0, currentHits: 0 }, limit: 10, elapsedMs: 0 },
    { counts: { previousHits: 1, currentHits: 9 }, limit: 10, elapsedMs: 59_999 },
    { counts: { previousHits: 100, currentHits: 0 }, limit: 1, elapsedMs: 59_000 },
  ];

  for (const testCase of cases) {
    const seconds = retryAfterSeconds({ ...testCase, windowMs: WINDOW });
    assert.ok(seconds >= 1, `expected >= 1, got ${seconds}`);
    assert.ok(Number.isInteger(seconds), `expected an integer, got ${seconds}`);
  }
});

test("a zero limit waits a full window rather than reporting no wait", () => {
  assert.equal(
    retryAfterSeconds({
      counts: { previousHits: 0, currentHits: 0 },
      limit: 0,
      windowMs: WINDOW,
      elapsedMs: 0,
    }),
    60,
  );
});
