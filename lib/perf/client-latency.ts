"use client";

/**
 * The browser's half of Phase L's latency budgets (constraint C5).
 *
 * Three of the six budgets in that table are the time between an input event
 * and a paint. No server can see both ends of that, so the client times them
 * and posts them to `POST /api/metrics/latency`, which feeds the same SLO
 * dashboard the server-measured objectives already report to. A budget that is
 * only ever checked by hand in a demo is not a budget.
 *
 * Two rules shape everything here:
 *
 *  - **Measuring must not cost more than the thing measured.** Observations
 *    are buffered and flushed on a slow timer, on page hide, and when the
 *    buffer fills — never one request per interaction.
 *  - **It must never be able to break the app.** Every entry point swallows;
 *    a failed report is a missing sample, which is visible on the dashboard as
 *    a smaller `sample` count, and that is the correct way for telemetry to
 *    fail.
 */

import type { ClientLatencyReport, ClientLatencySample } from "@/lib/api/contracts";
import type { ClientReportedSloId } from "@/lib/observability/slo";

/** How long a buffered batch may wait before it is sent. */
const FLUSH_INTERVAL_MS = 20_000;

/** Send early rather than drop: the route accepts 50 samples in one body. */
const MAX_BUFFERED_SAMPLES = 40;

/**
 * How long an unfinished mark is kept.
 *
 * A mark is started on a click and finished on a paint, and the paint may
 * never come — the user hits Escape, the navigation is cancelled, the query
 * fails. Those marks must expire rather than accumulate, and must never be
 * reported: "the switch took nine minutes" describes a user who went to lunch.
 */
const MARK_TTL_MS = 30_000;

type PendingMark = {
  readonly startedAt: number;
};

const pendingMarks = new Map<string, PendingMark>();
let buffer: ClientLatencySample[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;

function now(): number {
  return performance.now();
}

function sweepExpiredMarks(atMs: number): void {
  for (const [key, mark] of pendingMarks) {
    if (atMs - mark.startedAt >= MARK_TTL_MS) pendingMarks.delete(key);
  }
}

/**
 * Starts timing an interaction.
 *
 * Keyed by a string the two ends agree on — a thread id for a switch, a thread
 * id for a send — because the start happens in the sidebar or the composer and
 * the end happens in the transcript, and those are not in a parent/child
 * relationship that could pass a value down.
 *
 * Re-marking an in-flight key replaces it. Clicking a second thread before the
 * first has painted means the first switch is no longer what the user is
 * waiting for, and timing it to a paint they abandoned would be a fiction.
 */
export function markInteractionStart(key: string): void {
  const startedAt = now();
  sweepExpiredMarks(startedAt);
  pendingMarks.set(key, { startedAt });
}

/** Drops a mark without reporting it — a navigation the user cancelled. */
export function cancelInteraction(key: string): void {
  pendingMarks.delete(key);
}

/**
 * Closes a mark and records how long it took, measured to the frame in which
 * the result paints.
 *
 * `requestAnimationFrame` rather than the calling layout effect: an effect runs
 * before the browser paints, so stopping the clock there reports the time to
 * *decide* what to show rather than the time to show it. The callback fires at
 * the start of the frame that paints the change, which includes everything
 * this code is responsible for and excludes only the compositor step it is not.
 */
export function completeInteraction(key: string, metric: ClientReportedSloId): void {
  const mark = pendingMarks.get(key);
  if (mark === undefined) return;
  pendingMarks.delete(key);

  if (typeof requestAnimationFrame !== "function") return;
  requestAnimationFrame(() => {
    recordClientLatency(metric, now() - mark.startedAt);
  });
}

/** Buffers one observation. Exported for the call sites that time inline. */
export function recordClientLatency(metric: ClientReportedSloId, valueMs: number): void {
  if (!Number.isFinite(valueMs) || valueMs < 0) return;

  buffer.push({ metric, valueMs });
  attachFlushListeners();

  if (buffer.length >= MAX_BUFFERED_SAMPLES) {
    flushClientLatency();
    return;
  }

  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushClientLatency();
    }, FLUSH_INTERVAL_MS);
    // A pending report must never be the reason a tab is kept awake. `unref`
    // does not exist in the browser, so the page-hide listener below is what
    // guarantees the last batch is not lost instead.
  }
}

/**
 * Sends whatever is buffered.
 *
 * `sendBeacon` first, because the flush that matters most is the one on page
 * hide, and a `fetch` issued there is cancelled with the document. It is
 * allowed to refuse — the queue has a size limit — and `fetch` with `keepalive`
 * is the fallback rather than the default, since beacons are not subject to
 * CORS preflight and cost the page nothing.
 */
export function flushClientLatency(): void {
  if (buffer.length === 0) return;

  const report: ClientLatencyReport = { samples: buffer };
  buffer = [];

  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const body = JSON.stringify(report);

  try {
    if (navigator.sendBeacon(LATENCY_ENDPOINT, new Blob([body], { type: "application/json" }))) {
      return;
    }
  } catch {
    // Fall through to `fetch`. A beacon can throw on a blocked scheme.
  }

  void fetch(LATENCY_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // A dropped sample is the correct failure for telemetry. It shows up as a
    // smaller `sample` count on the dashboard, which is honest.
  });
}

const LATENCY_ENDPOINT = "/api/metrics/latency";

/**
 * Attached lazily, once, and only after something has actually been measured —
 * so a page that never interacts never registers a listener.
 *
 * `pagehide` rather than `unload`: `unload` disables the back/forward cache in
 * every modern browser, which would make this module's own subject — how fast
 * navigation feels — measurably worse.
 */
function attachFlushListeners(): void {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;

  window.addEventListener("pagehide", flushClientLatency);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushClientLatency();
  });
}

/** Test seam: forgets every pending mark and buffered sample. */
export function resetClientLatency(): void {
  pendingMarks.clear();
  buffer = [];
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

/** The key a thread switch is timed under. One per thread, by construction. */
export function threadSwitchMark(threadId: string): string {
  return `thread-switch:${threadId}`;
}

/** The key a send's optimistic echo is timed under. */
export function sendEchoMark(threadId: string): string {
  return `send-echo:${threadId}`;
}
