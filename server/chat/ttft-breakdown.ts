/**
 * Where the time before the first token goes (Phase L item 4).
 *
 * The exit criterion for that item is not "it got faster" — it is that the
 * next person optimising this path is not guessing either. So the pre-stream
 * work is divided into named segments, each one timed, and the breakdown is
 * emitted twice: as attributes on the turn's span, where it sits next to the
 * provider call it precedes, and as one `chat.ttft_breakdown` log line, where
 * it can be grouped without a tracing backend.
 *
 * The segments are the gates and the reads in `streamChat`, in the order they
 * run. Naming them here rather than inline is what stops the list drifting
 * into "everything that is not the model" — and the exhaustive union means a
 * segment added to the chat service has to be named here before it compiles.
 *
 * Nothing in this module can fail a turn. It is arithmetic over
 * `performance.now()`; a missing measurement is a missing number on a
 * dashboard, which is the correct way for instrumentation to break.
 */

import type { LogContext } from "@/server/lib/logger";
import type { SpanAttributes } from "@/server/observability/tracing";

/**
 * The pre-stream path, segment by segment.
 *
 * - `account_check` — is this account mid-deletion?
 * - `plan_resolve` — which plan's limits apply, from the local mirror.
 * - `rate_limit` — the two sliding windows.
 * - `stream_slot` — the concurrency lease.
 * - `thread_access` — ownership, and thread creation on first message.
 * - `memory_consent` — may this turn read and write memories at all?
 * - `attachments` — ownership and model capability for this turn's files.
 * - `quota` — the monthly reservation. The only gate that spends anything.
 * - `memory_lookup` — the embedding call and the vector read. Historically the
 *   largest single segment, which is why it has been its own log field since
 *   Phase A.
 * - `attachment_blocks` — reading the bytes for the provider.
 * - `stream_record` — the `chat_stream` row a reload reconnects to.
 * - `graph_start` — building the graph's inputs and entering it.
 */
export type TurnSegment =
  | "account_check"
  | "plan_resolve"
  | "rate_limit"
  | "stream_slot"
  | "thread_access"
  | "memory_consent"
  | "attachments"
  | "quota"
  | "memory_lookup"
  | "attachment_blocks"
  | "stream_record"
  | "graph_start";

export type TurnSegmentTimer = {
  /**
   * Times `work`, attributing it to `segment`. Returns whatever `work` returns.
   *
   * Accepts a synchronous result as well as a promise, because not every
   * segment is a round trip: `agent.streamEvents` returns its stream without
   * awaiting anything, and the setup it does before that is still part of the
   * path to the first token.
   */
  readonly measure: <TResult>(
    segment: TurnSegment,
    work: () => PromiseLike<TResult> | TResult,
  ) => Promise<TResult>;
  /** Attributes for the turn span: `chat.segment.<name>_ms`. */
  readonly attributes: () => SpanAttributes;
  /** The same numbers as log fields, plus the total they were measured inside. */
  readonly fields: () => LogContext;
  /** Milliseconds since the timer was started. */
  readonly elapsedMs: () => number;
};

/**
 * `memory_lookup` → `memoryLookup`.
 *
 * Span attributes are snake_case by OpenTelemetry convention and log fields
 * are camelCase by this codebase's; the segment names are written once, in
 * snake_case, and converted here rather than being listed twice. It also keeps
 * `memoryLookupMs` and `preStreamMs` on `chat.stream_started` spelled exactly
 * as they were before this module existed, which is what the
 * `chat_time_to_first_token_p95` runbook tells an operator to grep for.
 */
function camelCase(segment: TurnSegment): string {
  return segment.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

export function startTurnSegmentTimer(): TurnSegmentTimer {
  const startedAt = performance.now();
  const durations = new Map<TurnSegment, number>();

  const record = (segment: TurnSegment, ms: number) => {
    // Added rather than replaced: a segment can legitimately run twice — a
    // retried read, a second attachment batch — and reporting only the last
    // one would understate the path it is there to explain.
    durations.set(segment, (durations.get(segment) ?? 0) + ms);
  };

  return {
    measure: async (segment, work) => {
      const enteredAt = performance.now();
      try {
        return await work();
      } finally {
        // In `finally`, so a gate that *rejects* is still attributed. A slow
        // rate-limit check that throws is exactly the case worth seeing.
        record(segment, performance.now() - enteredAt);
      }
    },

    attributes: () => {
      const attributes: Record<string, number> = {};
      for (const [segment, ms] of durations) {
        attributes[`chat.segment.${segment}_ms`] = Math.round(ms);
      }
      return attributes;
    },

    fields: () => {
      const fields: LogContext = { preStreamMs: Math.round(performance.now() - startedAt) };
      for (const [segment, ms] of durations) {
        fields[`${camelCase(segment)}Ms`] = Math.round(ms);
      }
      return fields;
    },

    elapsedMs: () => performance.now() - startedAt,
  };
}
