import assert from "node:assert/strict";
import test from "node:test";
import {
  detectSpendAnomaly,
  median,
  medianAbsoluteDeviation,
} from "@/lib/observability/cost-anomaly";

test("median handles odd, even, and empty samples", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
});

test("the median absolute deviation is unmoved by a single outlier", () => {
  const steady = [10, 10, 10, 10, 10];
  assert.equal(medianAbsoluteDeviation(steady), 0);
  assert.equal(medianAbsoluteDeviation([...steady, 10_000]), 0);
});

test("a spike far above a steady baseline is flagged", () => {
  const verdict = detectSpendAnomaly({
    baselineUsd: [2, 2.1, 1.9, 2.2, 2, 1.8],
    todayUsd: 40,
  });

  assert.equal(verdict.anomalous, true);
  if (verdict.anomalous) assert.ok(verdict.ratio > 10);
});

test("ordinary variation is not flagged", () => {
  const verdict = detectSpendAnomaly({
    baselineUsd: [2, 2.1, 1.9, 2.2, 2, 1.8],
    todayUsd: 2.6,
  });

  assert.equal(verdict.anomalous, false);
  if (!verdict.anomalous) assert.equal(verdict.reason, "within_band");
});

test("trivial amounts never page, however large the relative jump", () => {
  const verdict = detectSpendAnomaly({
    baselineUsd: [0.001, 0.001, 0.001, 0.002, 0.001, 0.001],
    todayUsd: 0.4,
  });

  assert.equal(verdict.anomalous, false);
  if (!verdict.anomalous) assert.equal(verdict.reason, "below_floor");
});

test("a short history produces no verdict rather than a confident one", () => {
  const verdict = detectSpendAnomaly({ baselineUsd: [1, 40], todayUsd: 900 });

  assert.equal(verdict.anomalous, false);
  if (!verdict.anomalous) assert.equal(verdict.reason, "insufficient_history");
});

test("yesterday's incident does not raise the bar for today", () => {
  // The whole reason for a median over a mean: one runaway day in the baseline
  // must not let the next one through.
  const withIncident = [2, 2, 2, 900, 2, 2];
  const verdict = detectSpendAnomaly({ baselineUsd: withIncident, todayUsd: 60 });

  assert.equal(verdict.anomalous, true);
});

test("a first-ever payer is judged against the floor, not against zero", () => {
  const verdict = detectSpendAnomaly({
    baselineUsd: [0, 0, 0, 0, 0, 0],
    todayUsd: 0.5,
  });

  assert.equal(verdict.anomalous, false);
  if (!verdict.anomalous) assert.equal(verdict.reason, "below_floor");
});
