/**
 * The counters behind the two SLOs that have nothing durable to read.
 *
 * Chat time-to-first-token and the stream error rate are computed from the
 * `chat_stream` table, across every instance, which is what an SLO needs. The
 * API 5xx rate and the Polar ingest failure rate have no such table: nothing
 * writes a row per HTTP response or per usage event, and adding one would put
 * a write on the path of every single request to measure the rate at which
 * requests fail. So they are counted in memory, here.
 *
 * The cost of that is stated rather than hidden: **these two numbers are
 * per-instance.** On a fleet they describe whichever instance answered the
 * dashboard request, and after a cold start they describe the last few
 * minutes. That is enough to notice an outage and wrong for reporting an
 * uptime figure to anyone, and the dashboard says so where it shows them.
 *
 * Buckets are one minute wide and aligned to the epoch, exactly like the rate
 * limiter's windows, so nothing has to agree on when counting started.
 *
 * **The state hangs off `globalThis`, and it has to.** Next bundles server
 * components and route handlers into separate module graphs, so a plain
 * module-level `Map` is instantiated *twice inside one process* — the route
 * handler counts 27 requests while the page rendering the dashboard sees zero.
 * That was not a theory: it is what `/admin/operations` showed on the first
 * browser run of this code, against `/api/admin/slo` reporting 27 from the
 * same server. A symbol-keyed global is the standard way out and the same
 * reason a database client is pinned there.
 */

const BUCKET_MS = 60_000;
/** One hour of history. Sixty small objects; the whole structure is a few kilobytes. */
const BUCKET_COUNT = 60;

type Bucket = {
  /** Epoch-aligned bucket index, so a stale bucket is detectable rather than merely old. */
  index: number;
  total: number;
  failures: number;
};

type Series = {
  readonly buckets: Bucket[];
};

function createSeries(): Series {
  return {
    buckets: Array.from({ length: BUCKET_COUNT }, () => ({ index: -1, total: 0, failures: 0 })),
  };
}

type MetricsRegistry = {
  readonly apiRequests: Series;
  readonly billingIngests: Series;
};

declare global {
  // `var` rather than `let`: it is the only declaration that augments `globalThis`.
  var __aichatwaveMetrics: MetricsRegistry | undefined;
}

/**
 * The one registry for this process, shared across every module graph Next
 * builds. Created on first use rather than at import, so the two graphs cannot
 * race to replace each other's copy.
 */
function registry(): MetricsRegistry {
  globalThis.__aichatwaveMetrics ??= {
    apiRequests: createSeries(),
    billingIngests: createSeries(),
  };
  return globalThis.__aichatwaveMetrics;
}

function record(series: Series, params: { failed: boolean; nowMs: number }): void {
  const index = Math.floor(params.nowMs / BUCKET_MS);
  const slot = index % BUCKET_COUNT;
  const bucket = series.buckets[slot];
  if (bucket === undefined) return;

  // A slot whose index is not this minute's is an hour-old bucket coming back
  // around. Reset rather than add, or the ring would accumulate forever.
  if (bucket.index !== index) {
    bucket.index = index;
    bucket.total = 0;
    bucket.failures = 0;
  }

  bucket.total += 1;
  if (params.failed) bucket.failures += 1;
}

export type CounterSnapshot = {
  readonly total: number;
  readonly failures: number;
  /** How many minutes of the window actually held data, so a cold start is visible. */
  readonly bucketsObserved: number;
};

function snapshot(
  series: Series,
  params: { nowMs: number; windowMinutes: number },
): CounterSnapshot {
  const currentIndex = Math.floor(params.nowMs / BUCKET_MS);
  const oldestIndex = currentIndex - Math.max(1, params.windowMinutes) + 1;

  let total = 0;
  let failures = 0;
  let bucketsObserved = 0;

  for (const bucket of series.buckets) {
    if (bucket.index < oldestIndex || bucket.index > currentIndex) continue;
    total += bucket.total;
    failures += bucket.failures;
    bucketsObserved += 1;
  }

  return { total, failures, bucketsObserved };
}

/**
 * One API response. A 5xx is a failure; a 4xx is not, for the same reason the
 * incident classifier does not report one — it is the API answering.
 */
export function recordApiOutcome(params: {
  readonly route: string;
  readonly status: number;
  readonly now?: Date;
}): void {
  record(registry().apiRequests, {
    failed: params.status >= 500,
    nowMs: (params.now ?? new Date()).getTime(),
  });
}

/** One attempted Polar usage ingest. Usage that never arrives is revenue never billed. */
export function recordBillingIngest(params: {
  readonly failed: boolean;
  readonly now?: Date;
}): void {
  record(registry().billingIngests, {
    failed: params.failed,
    nowMs: (params.now ?? new Date()).getTime(),
  });
}

export function apiOutcomeSnapshot(params?: {
  readonly now?: Date;
  readonly windowMinutes?: number;
}): CounterSnapshot {
  return snapshot(registry().apiRequests, {
    nowMs: (params?.now ?? new Date()).getTime(),
    windowMinutes: params?.windowMinutes ?? BUCKET_COUNT,
  });
}

export function billingIngestSnapshot(params?: {
  readonly now?: Date;
  readonly windowMinutes?: number;
}): CounterSnapshot {
  return snapshot(registry().billingIngests, {
    nowMs: (params?.now ?? new Date()).getTime(),
    windowMinutes: params?.windowMinutes ?? BUCKET_COUNT,
  });
}

/** Test seam: clears both series so one test's traffic cannot leak into the next. */
export function resetMetrics(): void {
  const { apiRequests, billingIngests } = registry();
  for (const series of [apiRequests, billingIngests]) {
    for (const bucket of series.buckets) {
      bucket.index = -1;
      bucket.total = 0;
      bucket.failures = 0;
    }
  }
}
