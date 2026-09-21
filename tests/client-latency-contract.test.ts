/**
 * What a browser is allowed to tell the SLO dashboard.
 *
 * `POST /api/metrics/latency` writes straight into numbers an operator reads,
 * from a body a signed-in user controls. The mitigations are cheap by design
 * and stated in the route, and this is where they are held: a closed enum of
 * the three objectives a client can legitimately observe, a clamp rather than
 * a rejection for the tab that was backgrounded for an hour, and a bounded
 * batch.
 *
 * The negative case matters most. Time to first token is measured on the
 * server, and accepting a client's opinion of it would let a browser move an
 * objective it has no way of observing.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { clientLatencyReportSchema, clientLatencySampleSchema } from "@/lib/api/contracts";
import { CLIENT_REPORTED_SLO_IDS, MAX_CLIENT_LATENCY_MS } from "@/lib/observability/slo";

test("only the objectives a client can observe are accepted", () => {
  for (const metric of CLIENT_REPORTED_SLO_IDS) {
    assert.equal(clientLatencySampleSchema.safeParse({ metric, valueMs: 42 }).success, true);
  }
});

test("an objective the server measures for itself is refused", () => {
  const forged = clientLatencySampleSchema.safeParse({
    metric: "chat_time_to_first_token_warm_p95",
    valueMs: 1,
  });

  assert.equal(forged.success, false);
});

test("a wildly long observation is clamped, not dropped", () => {
  // A tab left in the background reports the wall clock it experienced. Losing
  // the sample would flatter the p95 more than clamping it distorts it.
  const parsed = clientLatencySampleSchema.parse({
    metric: "chat_thread_switch_warm_p95",
    valueMs: 60 * 60 * 1000,
  });

  assert.equal(parsed.valueMs, MAX_CLIENT_LATENCY_MS);
});

test("a negative duration is not a duration", () => {
  assert.equal(
    clientLatencySampleSchema.safeParse({ metric: "chat_optimistic_echo_p95", valueMs: -1 })
      .success,
    false,
  );
});

test("a batch is bounded at both ends", () => {
  const sample = { metric: "chat_optimistic_echo_p95", valueMs: 8 };

  assert.equal(clientLatencyReportSchema.safeParse({ samples: [] }).success, false);
  assert.equal(
    clientLatencyReportSchema.safeParse({ samples: Array.from({ length: 51 }, () => sample) })
      .success,
    false,
  );
  assert.equal(
    clientLatencyReportSchema.safeParse({ samples: Array.from({ length: 50 }, () => sample) })
      .success,
    true,
  );
});
