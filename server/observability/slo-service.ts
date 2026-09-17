/**
 * Measures the four objectives in `lib/observability/slo.ts` and says which of
 * them are being missed.
 *
 * Two of the four are read from the database and describe the whole fleet; two
 * are read from this process's counters and describe only the instance that
 * answered. That split is reported to the caller as `scope` rather than
 * smoothed over, because an operator reading "5xx rate: 0%" deserves to know
 * whether that means the service is healthy or only that this container is.
 *
 * Evaluating also *alerts*: an objective that crosses its paging threshold
 * emits `slo.breached` at error level and is reported as an incident, so the
 * dashboard is where you confirm a page rather than the only place the
 * breach exists.
 */

import {
  evaluateSlo,
  failureRatio,
  isPaging,
  percentile,
  SLO_IDS,
  SLOS,
  type SloEvaluation,
} from "@/lib/observability/slo";
import type { SloEvaluationDto, SloReportResponse } from "@/lib/api/contracts";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";
import { AppError } from "@/server/lib/app-error";
import { reportError } from "@/server/observability/error-reporter";
import { apiOutcomeSnapshot, billingIngestSnapshot } from "@/server/observability/metrics";
import { listTimeToFirstTokenMs, readStreamOutcomes } from "@/server/observability/slo-repository";

/** Enough samples for a stable p95 without reading a day of history for a dashboard. */
const LATENCY_SAMPLE_LIMIT = 5_000;

/** Which SLOs are fleet-wide facts and which are one instance's opinion. */
const SLO_SCOPE: Record<(typeof SLO_IDS)[number], "fleet" | "instance"> = {
  chat_time_to_first_token_p95: "fleet",
  chat_stream_error_rate: "fleet",
  api_server_error_rate: "instance",
  billing_ingest_failure_rate: "instance",
};

export async function buildSloReport(params: {
  readonly windowMinutes: number;
  readonly now?: Date;
  readonly log?: Logger;
}): Promise<SloReportResponse> {
  const now = params.now ?? new Date();
  const log = params.log ?? rootLogger;
  const since = new Date(now.getTime() - params.windowMinutes * 60_000);

  const [latencies, streams] = await Promise.all([
    listTimeToFirstTokenMs({ since, limit: LATENCY_SAMPLE_LIMIT }),
    readStreamOutcomes({ since }),
  ]);
  const api = apiOutcomeSnapshot({ now, windowMinutes: params.windowMinutes });
  const billing = billingIngestSnapshot({ now, windowMinutes: params.windowMinutes });

  const p95 = percentile(latencies, 0.95);

  const evaluations: SloEvaluation[] = [
    evaluateSlo(SLOS.chat_time_to_first_token_p95, {
      value: p95 ?? 0,
      sample: latencies.length,
    }),
    evaluateSlo(SLOS.chat_stream_error_rate, {
      value: failureRatio({ failures: streams.failed, total: streams.total }),
      sample: streams.total,
    }),
    evaluateSlo(SLOS.api_server_error_rate, {
      value: failureRatio({ failures: api.failures, total: api.total }),
      sample: api.total,
    }),
    evaluateSlo(SLOS.billing_ingest_failure_rate, {
      value: failureRatio({ failures: billing.failures, total: billing.total }),
      sample: billing.total,
    }),
  ];

  const breached = evaluations.filter(isPaging);
  for (const evaluation of breached) {
    log.error("slo.breached", {
      slo: evaluation.id,
      value: evaluation.value,
      pageAt: evaluation.pageAt,
      objective: evaluation.objective,
      sample: evaluation.sample,
      windowMinutes: params.windowMinutes,
      scope: SLO_SCOPE[evaluation.id],
    });
    // Routed through the same reporter as every other incident, so a breach
    // reaches wherever incidents already go instead of needing its own
    // delivery path. Typed 503 because a missed SLO is, by definition, the
    // service not doing what it promised.
    reportError({
      error: new AppError("SERVICE_UNAVAILABLE", `SLO breached: ${evaluation.title}`, {
        cause: new Error(
          `${evaluation.id} measured ${String(evaluation.value)} against a paging threshold of ${String(evaluation.pageAt)}.`,
        ),
      }),
      log,
      context: { slo: evaluation.id, value: evaluation.value, pageAt: evaluation.pageAt },
    });
  }

  return {
    windowMinutes: params.windowMinutes,
    generatedAt: now.toISOString(),
    paging: breached.length > 0,
    objectives: evaluations.map(toDto),
  };
}

function toDto(evaluation: SloEvaluation): SloEvaluationDto {
  return {
    id: evaluation.id,
    title: evaluation.title,
    unit: evaluation.unit,
    status: evaluation.status,
    value: evaluation.value,
    sample: evaluation.sample,
    objective: evaluation.objective,
    pageAt: evaluation.pageAt,
    scope: SLO_SCOPE[evaluation.id],
    runbook: SLOS[evaluation.id].runbook,
  };
}
