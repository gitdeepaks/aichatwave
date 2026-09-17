/**
 * The service level objectives this product is held to, and the arithmetic
 * that says whether one is being met.
 *
 * Written down here, in code, rather than in a dashboard someone configured
 * once: a threshold that only exists in a vendor UI is invisible to review,
 * cannot be tested, and is lost with the account. The numbers below are the
 * contract; `server/observability/slo-service.ts` measures against them.
 *
 * Every objective is "at most" — a latency, a failure rate — so there is one
 * comparison and no direction flag to get backwards.
 */

export type SloId =
  | "chat_time_to_first_token_p95"
  | "chat_stream_error_rate"
  | "api_server_error_rate"
  | "billing_ingest_failure_rate";

export type SloUnit = "milliseconds" | "ratio";

export type SloDefinition = {
  readonly id: SloId;
  readonly title: string;
  readonly unit: SloUnit;
  /** The target. Above this the objective is missed. */
  readonly objective: number;
  /** Above this, wake someone up. Deliberately looser than the objective. */
  readonly pageAt: number;
  /**
   * Observations required before a verdict is offered.
   *
   * A rate computed from three requests is noise, and paging on it is how an
   * on-call rotation learns to silence the alert. Below this the SLO reports
   * `insufficient_data`, which is a real answer and not a healthy one.
   */
  readonly minimumSample: number;
  /** What an operator should do about it, carried with the number that triggers it. */
  readonly runbook: string;
};

export const SLOS: Record<SloId, SloDefinition> = {
  chat_time_to_first_token_p95: {
    id: "chat_time_to_first_token_p95",
    title: "Chat time to first token (p95)",
    unit: "milliseconds",
    objective: 4_000,
    pageAt: 10_000,
    minimumSample: 20,
    runbook:
      "Check `preStreamMs` and `memoryLookupMs` on `chat.stream_started` first — the pre-stream " +
      "work (plan read, quota reservation, memory lookup) dominates this number, not the model.",
  },
  chat_stream_error_rate: {
    id: "chat_stream_error_rate",
    title: "Chat stream error rate",
    unit: "ratio",
    objective: 0.01,
    pageAt: 0.05,
    minimumSample: 20,
    runbook:
      "Counts `chat_stream` rows that settled `failed`. Aborted turns are the user stopping and " +
      "are excluded. Check provider breaker state in `llm.provider_breaker_opened`.",
  },
  api_server_error_rate: {
    id: "api_server_error_rate",
    title: "API 5xx rate",
    unit: "ratio",
    objective: 0.005,
    pageAt: 0.02,
    minimumSample: 50,
    runbook:
      "4xx responses are excluded by construction — they are the API answering. Group by " +
      "`AppError.code` from `route.request_failed`.",
  },
  billing_ingest_failure_rate: {
    id: "billing_ingest_failure_rate",
    title: "Polar usage ingest failure rate",
    unit: "ratio",
    objective: 0.01,
    pageAt: 0.1,
    minimumSample: 20,
    runbook:
      "Usage that never reaches Polar is revenue that is never billed. Run `pnpm polar:doctor`; " +
      "a wrong-environment token is the usual cause.",
  },
};

export const SLO_IDS: readonly SloId[] = [
  "chat_time_to_first_token_p95",
  "chat_stream_error_rate",
  "api_server_error_rate",
  "billing_ingest_failure_rate",
];

export type SloStatus = "healthy" | "degraded" | "paging" | "insufficient_data";

export type SloMeasurement = {
  readonly value: number;
  /** How many observations `value` was computed from. */
  readonly sample: number;
};

export type SloEvaluation = {
  readonly id: SloId;
  readonly title: string;
  readonly unit: SloUnit;
  readonly status: SloStatus;
  /** Null when there was not enough data to compute one. */
  readonly value: number | null;
  readonly sample: number;
  readonly objective: number;
  readonly pageAt: number;
};

export function evaluateSlo(definition: SloDefinition, measurement: SloMeasurement): SloEvaluation {
  const shared = {
    id: definition.id,
    title: definition.title,
    unit: definition.unit,
    sample: measurement.sample,
    objective: definition.objective,
    pageAt: definition.pageAt,
  };

  if (measurement.sample < definition.minimumSample) {
    return { ...shared, status: "insufficient_data", value: null };
  }

  const status: SloStatus =
    measurement.value >= definition.pageAt
      ? "paging"
      : measurement.value > definition.objective
        ? "degraded"
        : "healthy";

  return { ...shared, status, value: measurement.value };
}

/** True for the statuses that should reach a human immediately. */
export function isPaging(evaluation: SloEvaluation): boolean {
  return evaluation.status === "paging";
}

/**
 * Nearest-rank percentile.
 *
 * Nearest-rank rather than interpolated because the value it returns is one an
 * actual request experienced. "p95 was 4,180ms" that nobody ever saw is harder
 * to chase than "p95 was 4,203ms, and here is that request."
 *
 * Returns null for an empty sample rather than 0, which would read as a
 * perfect score.
 */
export function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => left - right);
  const clamped = Math.min(1, Math.max(0, fraction));
  const rank = Math.ceil(clamped * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? null;
}

/** Ratio of failures to total, with an empty sample reported as 0 rather than NaN. */
export function failureRatio(params: {
  readonly failures: number;
  readonly total: number;
}): number {
  if (params.total <= 0) return 0;
  return params.failures / params.total;
}
