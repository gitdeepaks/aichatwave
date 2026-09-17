/**
 * Server-side tracing and error correlation.
 *
 * Next hashes an uncaught server error into a `digest` and hands that — and
 * only that — to `app/error.tsx`. The stack and message never reach the
 * browser in production, by design. Without logging the digest here, the code
 * a user reads off the error page matches nothing in the logs and the whole
 * "quote this id when you report it" affordance is decorative.
 *
 * So: one structured line per uncaught request error, carrying the digest, the
 * inbound `x-request-id` when the caller supplied one, and the route. That
 * makes a user report resolvable by `grep`.
 *
 * `register` is the other half, added in Phase H: it starts the OpenTelemetry
 * SDK, which is what gives those same ids a trace to resolve to. The two are
 * independent — `onRequestError` logs with or without a tracing backend, and
 * the spans in `server/observability/tracing.ts` are no-ops without one.
 */

import type { Instrumentation } from "next";
import { logger } from "@/server/lib/logger";
import { reportError } from "@/server/observability/error-reporter";

/**
 * Starts the OpenTelemetry SDK, once per server instance, before the first
 * request is served.
 *
 * Gated on `tracingConfig().enabled` rather than started unconditionally: an
 * SDK with no exporter configured still builds, batches, and discards a span
 * per request, which is pure cost. See `lib/env.ts` for what turns it on.
 *
 * `@vercel/otel` is used over a hand-assembled `NodeSDK` for one reason that
 * matters here — `NodeSDK` does not run on the edge runtime, and this app's
 * proxy (`proxy.ts`) does.
 *
 * Imports are dynamic and inside the guard so that a deployment with tracing
 * off never loads the SDK at all, and so that a failure to start it is a
 * logged warning rather than a server that refuses to boot. Observability is
 * not allowed to be the thing that takes the product down.
 */
export async function register(): Promise<void> {
  const { tracingConfig } = await import("@/lib/env");
  const { langsmithStatus } = await import("@/server/observability/langsmith");
  const config = tracingConfig();

  // Stated at boot rather than inferred later: LangChain traces from the
  // environment with no code of ours involved, so "are prompts being sent to
  // LangSmith?" is otherwise unanswerable from inside the app.
  logger.info("langsmith.status", { ...langsmithStatus() });

  if (!config.enabled) {
    logger.info("otel.disabled", { reason: "no exporter configured" });
    return;
  }

  try {
    const { registerOTel } = await import("@vercel/otel");
    registerOTel({ serviceName: config.serviceName });
    logger.info("otel.registered", {
      serviceName: config.serviceName,
      endpoint: config.endpoint,
      runtime: process.env["NEXT_RUNTIME"] ?? null,
    });
  } catch (error) {
    logger.warn("otel.register_failed", { serviceName: config.serviceName }, error);
  }
}

/**
 * `digest` is not on `Error`; Next attaches it to the thrown value. Narrowed
 * here rather than asserted, so a non-Error throw cannot crash the logger.
 */
function readDigest(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if (!("digest" in error)) return undefined;
  const digest = error.digest;
  return typeof digest === "string" ? digest : undefined;
}

/** Header values arrive as `string | string[]`; keep the first well-formed one. */
function readHeader(
  headers: Readonly<NodeJS.Dict<string | string[]>>,
  name: string,
): string | undefined {
  const value = headers[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export const onRequestError: Instrumentation.onRequestError = (
  error,
  errorRequest,
  errorContext,
) => {
  const requestId = readHeader(errorRequest.headers, "x-request-id");

  logger.error(
    "request.unhandled_error",
    {
      // The join key: `app/error.tsx` shows this digest to the user.
      digest: readDigest(error),
      // Present only when the caller sent one. API routes echo it back, so a
      // report that quotes either id resolves to the same request.
      requestId,
      method: errorRequest.method,
      path: errorRequest.path,
      routePath: errorContext.routePath,
      routeType: errorContext.routeType,
      routerKind: errorContext.routerKind,
      renderSource: errorContext.renderSource,
    },
    error,
  );

  // Anything reaching here escaped every handler, so it is an incident unless
  // the classifier says otherwise — a `notFound()` or a deliberate abort
  // surfaces here too, and neither should page anyone.
  reportError({
    error,
    context: {
      requestId,
      digest: readDigest(error),
      routePath: errorContext.routePath,
      routeType: errorContext.routeType,
      source: "onRequestError",
    },
  });
};
