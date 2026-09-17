/**
 * Error tracking, without a vendor.
 *
 * Phase H item 2 asks for "Sentry or equivalent", and the equivalent is this:
 * an exception recorded on the active trace span — where it is already
 * correlated with the request id, the user, the model, and the rest of the
 * turn — plus an optional webhook for a deployment that has no tracing backend
 * to read it in.
 *
 * What a vendor SDK would add over this is a hosted UI and source-mapped
 * stacks. What it costs is a build plugin, a source-map upload token in CI, a
 * second wire protocol, and a second place errors can be dropped. The seam
 * here is one function; swapping in a real vendor later means writing one more
 * sink, not rewriting the call sites.
 *
 * The rule that makes any of this useful is `classifyIncident`: a 4xx is the
 * API answering, not failing, and reporting it is how an alert channel becomes
 * something people mute.
 */

import { env } from "@/lib/env";
import { classifyIncident, type ErrorFacts } from "@/lib/observability/incident-policy";
import { errorFacts } from "@/server/observability/error-facts";
import { logger as rootLogger, type LogContext, type Logger } from "@/server/lib/logger";
import { recordExceptionOnActiveSpan } from "@/server/observability/tracing";

/** How long the optional webhook may take before the report is abandoned. */
const WEBHOOK_TIMEOUT_MS = 3_000;

export type IncidentContext = LogContext;

/**
 * Reports a failure, or decides it is not one.
 *
 * Returns whether it was reported so a caller can assert on the decision in a
 * test, and so `route.request_failed` can say which way it went rather than
 * leaving an operator to infer it from the absence of an alert.
 *
 * Never throws and never rejects: a reporter that can fail the request it is
 * reporting on is worse than no reporter. The webhook is fire-and-forget by
 * construction.
 */
export function reportError(params: {
  readonly error: unknown;
  readonly context?: IncidentContext;
  readonly log?: Logger;
}): boolean {
  const log = params.log ?? rootLogger;
  const facts = errorFacts(params.error);
  const decision = classifyIncident(facts);

  if (!decision.report) return false;

  // The primary sink. When a tracing backend is configured this is the whole
  // integration: the exception lands on the span that already carries the
  // request id, the user, and the model.
  recordExceptionOnActiveSpan({ error: params.error, groupingKey: decision.groupingKey });

  const context: LogContext = {
    ...params.context,
    groupingKey: decision.groupingKey,
    errorName: facts.name,
    appErrorCode: facts.appErrorCode,
    status: facts.status,
  };

  log.error("incident.reported", context, params.error);
  postToWebhook({ groupingKey: decision.groupingKey, facts, context, log });

  return true;
}

/** The shape posted to `ERROR_WEBHOOK_URL`. This app's own, not a vendor envelope. */
export type IncidentPayload = {
  readonly groupingKey: string;
  readonly errorName: string;
  readonly appErrorCode: string | null;
  readonly status: number | null;
  readonly occurredAt: string;
  readonly context: LogContext;
};

function postToWebhook(params: {
  readonly groupingKey: string;
  readonly facts: ErrorFacts;
  readonly context: LogContext;
  readonly log: Logger;
}): void {
  const url = env.ERROR_WEBHOOK_URL;
  if (url === undefined) return;

  const payload: IncidentPayload = {
    groupingKey: params.groupingKey,
    errorName: params.facts.name,
    appErrorCode: params.facts.appErrorCode,
    status: params.facts.status,
    occurredAt: new Date().toISOString(),
    context: params.context,
  };

  // Deliberately not awaited and deliberately not handed to `waitUntil`: this
  // runs on the failure path, where the request is already over and the only
  // thing that must not happen is a second failure. A rejection is logged and
  // goes no further.
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  }).then(
    (response) => {
      if (response.ok) return;
      params.log.warn("incident.webhook_rejected", { status: response.status });
    },
    (cause: unknown) => {
      params.log.warn("incident.webhook_failed", {}, cause);
    },
  );
}
