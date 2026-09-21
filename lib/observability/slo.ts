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
  | "chat_time_to_first_token_warm_p95"
  | "chat_time_to_first_token_cold_p95"
  | "chat_thread_switch_warm_p95"
  | "chat_thread_switch_cold_p95"
  | "chat_optimistic_echo_p95"
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
      "Read `chat.ttft_breakdown`: every pre-stream segment is named there, and `preStreamMs` " +
      "and `memoryLookupMs` on `chat.stream_started` are two of them. Split warm from cold with " +
      "the two objectives below before concluding anything from this one.",
  },
  /**
   * Phase L's budget for a warm invocation, which is the one a user in a
   * conversation actually experiences.
   *
   * Deliberately much tighter than the fleet objective above, and deliberately
   * *alongside* it rather than replacing it: the fleet number is read from
   * `chat_stream` and mixes warm and cold, which is the right outer guard and
   * the wrong thing to hold a latency budget to. A cold lambda that misses
   * 900ms is not a regression; a warm one that does is.
   */
  chat_time_to_first_token_warm_p95: {
    id: "chat_time_to_first_token_warm_p95",
    title: "Time to first token, warm (p95)",
    unit: "milliseconds",
    objective: 900,
    pageAt: 1_800,
    minimumSample: 20,
    runbook:
      "Read `chat.ttft_breakdown` on the slow requests: every pre-stream segment is named there " +
      "and the one that grew is the one to cut. Do not optimise by guess (Phase L item 4).",
  },
  /**
   * The same measurement on the invocations that also paid for a cold start.
   * Separated rather than excluded, because a deployment whose cold starts are
   * slow is a deployment whose first impression is slow.
   */
  chat_time_to_first_token_cold_p95: {
    id: "chat_time_to_first_token_cold_p95",
    title: "Time to first token, cold start (p95)",
    unit: "milliseconds",
    objective: 1_800,
    pageAt: 3_600,
    minimumSample: 5,
    runbook:
      "Cold-start cost is module init, not request work. Check what `server/chat/chat-service.ts` " +
      "pulls in at import time and whether the provider client cache is being rebuilt per process.",
  },
  /**
   * Switching to a conversation the tab has already seen. The headline number
   * of this phase: a cache hit has no excuse to take longer than a frame or
   * two, and anything above this means the render is not coming from the
   * client cache at all.
   */
  chat_thread_switch_warm_p95: {
    id: "chat_thread_switch_warm_p95",
    title: "Thread switch, cached (p95)",
    unit: "milliseconds",
    objective: 100,
    pageAt: 400,
    minimumSample: 20,
    runbook:
      "A warm switch must not touch the network. If this is above budget, the transcript is " +
      "rendering from a refetch rather than from the persisted query cache — check that " +
      "`lib/cache/query-persistence.ts` hydrated, and that the thread was prefetched on intent.",
  },
  /** The first visit to a thread, where a round trip is legitimate. */
  chat_thread_switch_cold_p95: {
    id: "chat_thread_switch_cold_p95",
    title: "Thread switch, cold (p95)",
    unit: "milliseconds",
    objective: 400,
    pageAt: 1_200,
    minimumSample: 20,
    runbook:
      "One round trip to `GET /api/threads/[id]/messages`. Above budget means the route is slow, " +
      "not the client — compare against the API 5xx panel and the database.",
  },
  /**
   * The user's own message appearing after they press send.
   *
   * One frame. It is the only budget here that is a correctness claim rather
   * than a performance one: anything measurable above a frame means the echo
   * waited on something, and the only thing it could have waited on is the
   * network.
   */
  chat_optimistic_echo_p95: {
    id: "chat_optimistic_echo_p95",
    title: "Optimistic echo of a sent message (p95)",
    unit: "milliseconds",
    objective: 16,
    pageAt: 100,
    minimumSample: 20,
    runbook:
      "Send must paint before any request. Check that nothing was awaited in " +
      "`use-chat-composer.ts` between the submit event and `sendMessage`.",
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
  "chat_time_to_first_token_warm_p95",
  "chat_time_to_first_token_cold_p95",
  "chat_thread_switch_warm_p95",
  "chat_thread_switch_cold_p95",
  "chat_optimistic_echo_p95",
  "chat_stream_error_rate",
  "api_server_error_rate",
  "billing_ingest_failure_rate",
];

/**
 * The objectives only the browser can measure, and therefore the only values
 * this deployment accepts over HTTP from one.
 *
 * Narrow on purpose. `POST /api/metrics/latency` writes straight into the
 * numbers the SLO dashboard reports, so the set of ids a client may name is a
 * closed enum rather than a string — otherwise any signed-in user could invent
 * an objective, or poison one they have no way of observing. Time to first
 * token is measured on the server and is absent here for exactly that reason:
 * the browser sees it, but the server *knows* it.
 */
export const CLIENT_REPORTED_SLO_IDS = [
  "chat_thread_switch_warm_p95",
  "chat_thread_switch_cold_p95",
  "chat_optimistic_echo_p95",
] as const;

export type ClientReportedSloId = (typeof CLIENT_REPORTED_SLO_IDS)[number];

/**
 * The largest value a client report may carry, in milliseconds.
 *
 * A tab left in the background for an hour reports the hour, because a
 * throttled timer is still a timer. Clamping rather than rejecting keeps the
 * sample — a slow switch is a slow switch — while stopping one backgrounded
 * tab from owning the p95 of every panel for the rest of the window.
 */
export const MAX_CLIENT_LATENCY_MS = 60_000;

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
