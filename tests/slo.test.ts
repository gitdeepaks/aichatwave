import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateSlo,
  failureRatio,
  isPaging,
  percentile,
  SLO_IDS,
  SLOS,
} from "@/lib/observability/slo";

test("every declared SLO id has a definition, and the two agree", () => {
  for (const id of SLO_IDS) {
    const definition = SLOS[id];
    assert.equal(definition.id, id);
    assert.ok(definition.runbook.length > 0, `${id} needs a runbook`);
    // Paging looser than the objective: an SLO you page on the moment you miss
    // it is an SLO nobody keeps.
    assert.ok(definition.pageAt > definition.objective, `${id} pages too eagerly`);
  }
});

test("a measurement below the minimum sample reports insufficient data, not health", () => {
  const evaluation = evaluateSlo(SLOS.api_server_error_rate, { value: 1, sample: 3 });

  assert.equal(evaluation.status, "insufficient_data");
  assert.equal(evaluation.value, null);
  assert.equal(isPaging(evaluation), false);
});

test("the three healthy-to-paging bands are exclusive and ordered", () => {
  const definition = SLOS.chat_stream_error_rate;
  const sample = definition.minimumSample;

  assert.equal(evaluateSlo(definition, { value: definition.objective, sample }).status, "healthy");
  assert.equal(
    evaluateSlo(definition, { value: definition.objective + 0.001, sample }).status,
    "degraded",
  );
  assert.equal(evaluateSlo(definition, { value: definition.pageAt, sample }).status, "paging");
});

test("percentile is nearest-rank, so it always returns a value someone experienced", () => {
  const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  assert.equal(percentile(values, 0.95), 100);
  assert.equal(percentile(values, 0.5), 50);
  assert.equal(percentile(values, 0), 10);
  assert.ok(values.includes(percentile(values, 0.9) ?? -1));
});

test("percentile of nothing is null, not zero", () => {
  assert.equal(percentile([], 0.95), null);
});

test("failure ratio of an empty window is zero rather than NaN", () => {
  assert.equal(failureRatio({ failures: 0, total: 0 }), 0);
  assert.equal(failureRatio({ failures: 1, total: 4 }), 0.25);
});
