/**
 * The app's one seam onto OpenTelemetry.
 *
 * Every span this codebase creates goes through `withSpan`, and nothing
 * outside this file imports `@opentelemetry/api`. That buys two things worth
 * the indirection:
 *
 *  - **No flag to forget.** `@opentelemetry/api` resolves to a no-op tracer
 *    when no SDK has been registered, so the instrumentation is
 *    unconditional. A deployment with no tracing backend runs the same code
 *    path and pays a function call.
 *  - **A narrow surface.** Call sites get `setAttributes` and nothing else —
 *    not a `Span`, with its context manipulation and its ability to be ended
 *    twice. Spans are ended here, in a `finally`, or they are not ended at all.
 *
 * Trace ids are also mirrored into every log line (`server/lib/logger.ts`),
 * which is what makes the exit criterion work in both directions: a user
 * quotes a request id, the logs give the trace id, the trace gives the route →
 * graph → LLM → tool tree.
 */

import {
  context as otelContext,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";

const TRACER_NAME = "aichatwave";

/**
 * Attribute values OpenTelemetry accepts and this app actually produces.
 * Narrower than `Attributes` on purpose: an accidental object attribute is
 * dropped silently by exporters, which is the kind of gap nobody notices.
 */
export type SpanAttributes = Readonly<Record<string, string | number | boolean | undefined>>;

/** What a running span exposes to the code inside it. */
export type SpanHandle = {
  /** Adds attributes discovered mid-span — token counts, the model that actually answered. */
  readonly setAttributes: (attributes: SpanAttributes) => void;
  /** Attaches an exception to this span without ending it or marking it failed. */
  readonly recordException: (error: unknown) => void;
};

function tracer() {
  return trace.getTracer(TRACER_NAME);
}

/**
 * `undefined` values are dropped rather than sent.
 *
 * `exactOptionalPropertyTypes` makes "absent" and "present and undefined"
 * different types in this codebase, and the OTel wire format has no
 * representation for the latter — an exporter turns it into a null or drops
 * the whole attribute set depending on the vendor. Dropping it here makes the
 * behavior the same everywhere.
 */
function toAttributes(attributes: SpanAttributes): Attributes {
  const result: Attributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) continue;
    result[key] = value;
  }
  return result;
}

function handleFor(span: Span): SpanHandle {
  return {
    setAttributes: (attributes) => {
      span.setAttributes(toAttributes(attributes));
    },
    recordException: (error) => {
      span.recordException(toException(error));
    },
  };
}

/** `recordException` wants an `Error` or a string; a non-`Error` throw becomes the latter. */
function toException(error: unknown): Error | string {
  if (error instanceof Error) return error;
  if (typeof error === "string") return error;
  return String(error);
}

/**
 * Runs `work` inside a new active span.
 *
 * "Active" is the load-bearing word: anything `work` awaits — including a
 * provider call and a tool — nests under this span automatically, which is
 * what produces the route → graph → LLM → tool tree rather than four
 * unrelated spans.
 *
 * A thrown error is recorded and the span is marked `ERROR` before the throw
 * is re-raised, so the span reflects what happened without this wrapper
 * changing control flow. `withSpan` never swallows.
 */
export async function withSpan<TResult>(
  name: string,
  attributes: SpanAttributes,
  work: (span: SpanHandle) => Promise<TResult>,
): Promise<TResult> {
  return tracer().startActiveSpan(name, { attributes: toAttributes(attributes) }, async (span) => {
    try {
      return await work(handleFor(span));
    } catch (error) {
      span.recordException(toException(error));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Starts a span whose lifetime is not a function call.
 *
 * A chat turn outlives the request that started it: the handler returns as
 * soon as the `Response` exists and the body keeps producing for as long as
 * the model takes. `withSpan` cannot express that, because there is no
 * enclosing `await` to hold the span open — so this returns the span, the
 * context to re-enter, and the function that ends it. The caller owns all
 * three; `server/observability/turn-trace.ts` is the only one that does.
 */
export type DetachedSpan = {
  readonly handle: SpanHandle;
  /** Re-enters this span as the active one, for work that resumes in another async context. */
  readonly runInContext: <TResult>(work: () => TResult) => TResult;
  readonly end: (outcome: { readonly failed: boolean; readonly message?: string }) => void;
  readonly traceId: string | null;
};

export function startDetachedSpan(name: string, attributes: SpanAttributes): DetachedSpan {
  const span = tracer().startSpan(name, { attributes: toAttributes(attributes) });
  const spanContext = trace.setSpan(otelContext.active(), span);
  const traceId = span.spanContext().traceId;

  return {
    handle: handleFor(span),
    runInContext: (work) => otelContext.with(spanContext, work),
    end: (outcome) => {
      if (outcome.failed) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          ...(outcome.message === undefined ? {} : { message: outcome.message }),
        });
      }
      span.end();
    },
    // All-zero is OTel's "no recording span", which is what a no-op tracer
    // returns. Reported as null so a log line never carries a fake id.
    traceId: traceId === "00000000000000000000000000000000" ? null : traceId,
  };
}

export type TraceCorrelation = {
  readonly traceId: string | undefined;
  readonly spanId: string | undefined;
};

/**
 * The active trace and span ids, for stamping onto a log line.
 *
 * Returns undefined for both when nothing is recording, so a deployment
 * without tracing emits exactly the log lines it emitted before.
 */
export function currentTraceCorrelation(): TraceCorrelation {
  const span = trace.getActiveSpan();
  if (span === undefined) return { traceId: undefined, spanId: undefined };

  const spanContext = span.spanContext();
  if (spanContext.traceId === "00000000000000000000000000000000") {
    return { traceId: undefined, spanId: undefined };
  }
  return { traceId: spanContext.traceId, spanId: spanContext.spanId };
}

/** Adds attributes to whatever span is currently active. A no-op when nothing is recording. */
export function annotateActiveSpan(attributes: SpanAttributes): void {
  trace.getActiveSpan()?.setAttributes(toAttributes(attributes));
}

/** Attaches an exception to whatever span is currently active, if any. Used by the error reporter. */
export function recordExceptionOnActiveSpan(params: {
  readonly error: unknown;
  readonly groupingKey: string;
}): void {
  const span = trace.getActiveSpan();
  if (span === undefined) return;

  span.recordException(toException(params.error));
  span.setAttributes(toAttributes({ "app.error.grouping_key": params.groupingKey }));
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: params.error instanceof Error ? params.error.message : String(params.error),
  });
}
