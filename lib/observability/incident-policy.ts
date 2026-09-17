/**
 * What counts as an incident.
 *
 * Kept pure and vendor-free so the decision can be tested without a reporter,
 * and so swapping the sink (an OTLP backend, a webhook, Sentry later) never
 * changes what is reported — only where it goes.
 *
 * The distinction this module exists to make: a 4xx is the API working. A
 * signed-out caller, a malformed body, a foreign thread id and a spent quota
 * are all *answers*, and paging someone for them trains everyone to ignore the
 * page. Only a failure the operator can act on is an incident.
 */

/** Why a failure was judged not to be an incident. Carried so the decision is auditable. */
export type IncidentSkipReason =
  /** A `4xx` the API deliberately produced: the caller is being told something. */
  | "expected_client_error"
  /** A stop, a disconnect, or a turn deadline. Cancellation is not failure. */
  | "deliberate_abort";

export type IncidentDecision =
  | { readonly report: false; readonly reason: IncidentSkipReason }
  | { readonly report: true; readonly groupingKey: string };

/**
 * The facts about a thrown value that the decision depends on.
 *
 * A record of primitives rather than the error itself: narrowing a thrown
 * `unknown` is the reporter's job (`server/observability/error-reporter.ts`),
 * and keeping it out of here is what lets this module be exercised from a test
 * with no `AppError`, no provider SDK, and no `Error` subclass at all.
 */
export type ErrorFacts = {
  /** `error.name`, or `"UnknownError"` for a non-`Error` throw. */
  readonly name: string;
  /** The `AppError` code when the failure was typed by this app, else null. */
  readonly appErrorCode: string | null;
  /** The HTTP status the failure maps to, when it maps to one. */
  readonly status: number | null;
  /** True for an `AbortError` or an explicitly cancelled operation. */
  readonly aborted: boolean;
};

/**
 * Decides whether a failure is reportable, and what to group it under.
 *
 * The grouping key is `AppError.code` wherever there is one. That is a
 * deliberate choice over a stack fingerprint: `UPSTREAM_ERROR` thrown from
 * four call sites is one problem with one owner, and four separate issues that
 * each look minor is how a real outage gets triaged as noise. Untyped throws
 * fall back to the error's class name, which is the coarsest honest key
 * available without reading a stack.
 */
export function classifyIncident(facts: ErrorFacts): IncidentDecision {
  if (facts.aborted) {
    return { report: false, reason: "deliberate_abort" };
  }

  if (facts.appErrorCode !== null) {
    // A typed error carries its own status, so "is this the caller's fault?"
    // is answered by the type rather than guessed from the message.
    if (facts.status !== null && facts.status < 500) {
      return { report: false, reason: "expected_client_error" };
    }
    return { report: true, groupingKey: facts.appErrorCode };
  }

  return { report: true, groupingKey: facts.name };
}
