/**
 * The latency observations behind Phase L's budgets.
 *
 * `chat_stream` already records one timestamp pair per turn, and the fleet-wide
 * time-to-first-token SLO is computed from it. The five budgets Phase L adds
 * have no such table, and giving them one would mean a write per thread switch
 * and a write per keystroke-to-paint — a row per *frame* of interaction, to
 * measure how fast interaction is. So they are counted here, in process
 * memory, exactly as the API 5xx and Polar ingest rates already are.
 *
 * The cost is the same one `metrics.ts` states and it is stated again rather
 * than assumed read: **these numbers are per-instance.** On a fleet they
 * describe whichever instance answered the dashboard request, and after a cold
 * start they describe the last few minutes. The SLO report carries a `scope`
 * field so the dashboard can say so where it shows them.
 *
 * Unlike `metrics.ts`, a percentile cannot be computed from counters — it needs
 * the observations themselves. So each objective keeps a bounded ring of
 * samples tagged with the minute they landed in, which gives a windowed p95
 * with a fixed memory ceiling: nine objectives is at most
 * `MAX_SAMPLES_PER_METRIC` numbers each, a few hundred kilobytes at the very
 * worst, and typically far less.
 *
 * **The state hangs off `globalThis` for the reason `metrics.ts` documents:**
 * Next builds route handlers and server components into separate module
 * graphs, so a plain module-level `Map` exists twice in one process and the
 * ingest route would count into a store the dashboard never reads.
 */

import type { SloId } from "@/lib/observability/slo";

/** One minute, matching the bucket width `metrics.ts` uses. */
const BUCKET_MS = 60_000;

/**
 * How many observations one objective retains.
 *
 * A p95 over 2,000 samples is stable, and the ring is what stops a busy hour
 * from growing without bound. When it wraps, the oldest observation is dropped
 * — which is the right thing to lose, because the window filter would have
 * excluded it shortly anyway.
 */
const MAX_SAMPLES_PER_METRIC = 2_000;

type Sample = {
  /** Epoch-aligned minute, so a stale sample is detectable rather than merely old. */
  minute: number;
  valueMs: number;
};

type Ring = {
  readonly samples: Sample[];
  /** Where the next observation is written. */
  cursor: number;
};

type LatencyRegistry = {
  readonly rings: Map<SloId, Ring>;
};

declare global {
  // `var` rather than `let`: it is the only declaration that augments `globalThis`.
  var __aichatwaveLatencySamples: LatencyRegistry | undefined;
}

function registry(): LatencyRegistry {
  globalThis.__aichatwaveLatencySamples ??= { rings: new Map<SloId, Ring>() };
  return globalThis.__aichatwaveLatencySamples;
}

function ringFor(id: SloId): Ring {
  const { rings } = registry();
  const existing = rings.get(id);
  if (existing !== undefined) return existing;

  const created: Ring = { samples: [], cursor: 0 };
  rings.set(id, created);
  return created;
}

/**
 * Records one observation against an objective.
 *
 * Never throws and never rejects a value: a negative or non-finite number is
 * dropped rather than propagated, because the callers are an HTTP body and a
 * `performance.now()` subtraction, and neither is worth failing a request over.
 */
export function recordLatencySample(params: {
  readonly id: SloId;
  readonly valueMs: number;
  readonly now?: Date;
}): void {
  if (!Number.isFinite(params.valueMs) || params.valueMs < 0) return;

  const ring = ringFor(params.id);
  const sample: Sample = {
    minute: Math.floor((params.now ?? new Date()).getTime() / BUCKET_MS),
    valueMs: params.valueMs,
  };

  if (ring.samples.length < MAX_SAMPLES_PER_METRIC) {
    ring.samples.push(sample);
    return;
  }

  ring.samples[ring.cursor] = sample;
  ring.cursor = (ring.cursor + 1) % MAX_SAMPLES_PER_METRIC;
}

/**
 * Every observation for an objective inside the window, unordered.
 *
 * Unordered because `percentile` sorts a copy anyway, and sorting twice to
 * preserve an order nothing reads would be work done for appearances.
 */
export function latencySamples(params: {
  readonly id: SloId;
  readonly windowMinutes: number;
  readonly now?: Date;
}): number[] {
  const currentMinute = Math.floor((params.now ?? new Date()).getTime() / BUCKET_MS);
  const oldestMinute = currentMinute - Math.max(1, params.windowMinutes) + 1;

  const values: number[] = [];
  for (const sample of ringFor(params.id).samples) {
    if (sample.minute < oldestMinute || sample.minute > currentMinute) continue;
    values.push(sample.valueMs);
  }
  return values;
}

/** Test seam: forgets every observation, so one test's traffic cannot leak into the next. */
export function resetLatencySamples(): void {
  registry().rings.clear();
}
