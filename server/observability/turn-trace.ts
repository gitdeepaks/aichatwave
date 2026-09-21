/**
 * The span for a chat turn, which outlives the request that started it.
 *
 * `withSpan` covers work that finishes inside an `await`. A turn does not:
 * `streamChat` returns a `Response` as soon as the stream object exists, and
 * the graph then runs for as long as the model takes, driven by pulls from the
 * platform's stream machinery. Those pulls happen in a different async context
 * from the request, so OpenTelemetry's automatic parenting — which rides on
 * async local storage — does not reach them. Left alone, the `llmCall` span
 * for a turn is a root span with no route above it, and the exit criterion for
 * this phase ("a request id resolves to route → graph → LLM → tool") is not
 * met.
 *
 * So the turn's span is held here, keyed by the same branded `turnId` that
 * already joins the graph and the stream (`server/chat/turn-registry.ts`), and
 * graph nodes re-enter it explicitly. Kept in its own module rather than added
 * to the turn registry so that the registry stays free of vendor types and one
 * import of `@opentelemetry/api` does not spread into the chat domain.
 *
 * Entries are removed when the turn settles, which `onStreamSettled` covers on
 * all three of a stream's exits. The sweep below is for the abnormal one: a
 * span that is never ended is a span that is never exported *and* a map entry
 * held for the life of the process, so both are bounded by the same TTL the
 * turn registry uses.
 */

import type { TurnId } from "@/server/chat/runtime-context";
import {
  startDetachedSpan,
  type DetachedSpan,
  type SpanAttributes,
} from "@/server/observability/tracing";

type HeldSpan = {
  readonly span: DetachedSpan;
  readonly startedAtMs: number;
};

const turnSpans = new Map<string, HeldSpan>();

/**
 * How long a span may stay open before the sweep ends it. Matches
 * `TURN_TTL_MS` in the turn registry: the two hold one turn's state between
 * them and should forget it at the same moment.
 */
const TURN_SPAN_TTL_MS = 15 * 60 * 1000;

/**
 * Ends spans whose turn never settled.
 *
 * `failed` is the honest status: a turn that produced no outcome did not
 * complete, and leaving the span unended would drop it from the trace
 * entirely — the one case where an operator most needs to see something.
 */
function sweepExpiredSpans(nowMs: number): void {
  for (const [turnId, held] of turnSpans) {
    if (nowMs - held.startedAtMs < TURN_SPAN_TTL_MS) continue;
    turnSpans.delete(turnId);
    held.span.handle.setAttributes({ "chat.turn.outcome": "abandoned" });
    held.span.end({ failed: true, message: "turn never settled" });
  }
}

/**
 * Opens the turn's span. Returns the trace id so the caller can log it once,
 * which is the line that turns a user-reported request id into a trace lookup.
 */
export function startTurnSpan(params: {
  readonly turnId: TurnId;
  readonly attributes: SpanAttributes;
}): string | null {
  const nowMs = Date.now();
  sweepExpiredSpans(nowMs);

  const span = startDetachedSpan("chat.turn", params.attributes);
  turnSpans.set(params.turnId, { span, startedAtMs: nowMs });
  return span.traceId;
}

/**
 * Runs `work` with the turn's span active, so anything it creates nests under
 * the turn rather than floating as its own trace.
 *
 * A turn with no span — a graph invoked outside `streamChat`, or a process
 * that lost the record to the sweep — runs `work` unchanged. Tracing never
 * decides whether the product works.
 */
export function withTurnSpan<TResult>(turnId: TurnId, work: () => TResult): TResult {
  const held = turnSpans.get(turnId);
  if (held === undefined) return work();
  return held.span.runInContext(work);
}

/**
 * Adds attributes to a turn's span without ending it.
 *
 * `annotateActiveSpan` cannot reach this one: the turn's span is deliberately
 * detached, so by the time the first token arrives — in a pull driven by the
 * platform's stream machinery, in a different async context — there is no
 * active span to annotate. The time-to-first-token breakdown is discovered at
 * exactly that moment and belongs on the turn, not on a root span of its own.
 */
export function annotateTurnSpan(turnId: TurnId, attributes: SpanAttributes): void {
  turnSpans.get(turnId)?.span.handle.setAttributes(attributes);
}

/**
 * Closes the turn's span and drops the record.
 *
 * `aborted` is not a failure: the user stopped the answer and got what they
 * asked for. Marking it `ERROR` would put every deliberate stop into the
 * error-rate panel, which is the same mistake as reporting 4xx as incidents.
 */
export function endTurnSpan(params: {
  readonly turnId: TurnId;
  readonly outcome: "completed" | "aborted" | "failed";
  readonly attributes?: SpanAttributes;
}): void {
  const held = turnSpans.get(params.turnId);
  if (held === undefined) return;
  turnSpans.delete(params.turnId);

  if (params.attributes !== undefined) held.span.handle.setAttributes(params.attributes);
  held.span.handle.setAttributes({ "chat.turn.outcome": params.outcome });
  held.span.end({ failed: params.outcome === "failed", message: `turn ${params.outcome}` });
}

/** Test seam: how many turn spans are currently open. */
export function openTurnSpanCount(): number {
  return turnSpans.size;
}
