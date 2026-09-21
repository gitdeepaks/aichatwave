import { clientLatencyReportSchema, type ClientLatencyResponse } from "@/lib/api/contracts";
import { recordLatencySample } from "@/server/observability/latency-samples";
import { createRouteHandler, jsonResponse, noParams, noQuery } from "@/server/lib/route-handler";

/**
 * Where the browser's half of Phase L's budgets arrives.
 *
 * Three of the six numbers in that table — a cached thread switch, a cold
 * thread switch, and the optimistic echo — are not observable from the server
 * at all. They are the time between a click and a paint, and the only process
 * that can see both ends of that is the one doing the painting. So the client
 * measures them and posts them here, and `buildSloReport` reads them back
 * alongside the objectives the server measures for itself.
 *
 * The trust model is stated rather than assumed. A signed-in user could post
 * fabricated numbers, and the mitigations are deliberately cheap ones: the
 * metric id is a closed enum of the three objectives a client can legitimately
 * observe (`CLIENT_REPORTED_SLO_IDS`), the value is clamped, the batch is
 * bounded, and nothing here writes to a domain table or costs money. The worst
 * an abusive client achieves is a wrong number on an operator's dashboard, and
 * the dashboard already reports these as instance-scoped rather than as fact.
 *
 * Sessioned rather than public for the same reason: it keeps the surface behind
 * the same gate as everything else, and an unauthenticated firehose into a p95
 * panel is not a surface worth having.
 */
export const POST = createRouteHandler({
  name: "POST /api/metrics/latency",
  params: noParams,
  query: noQuery,
  body: clientLatencyReportSchema,
  handler: ({ body }) => {
    const now = new Date();
    for (const sample of body.samples) {
      recordLatencySample({ id: sample.metric, valueMs: sample.valueMs, now });
    }

    const response: ClientLatencyResponse = { recorded: body.samples.length };
    return Promise.resolve(jsonResponse(response));
  },
});
