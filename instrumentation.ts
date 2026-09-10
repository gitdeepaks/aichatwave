/**
 * Server-side error correlation.
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
 * Phase H adds OpenTelemetry `register()` to this same file; the two are
 * independent.
 */

import type { Instrumentation } from "next";
import { logger } from "@/server/lib/logger";

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
  logger.error(
    "request.unhandled_error",
    {
      // The join key: `app/error.tsx` shows this digest to the user.
      digest: readDigest(error),
      // Present only when the caller sent one. API routes echo it back, so a
      // report that quotes either id resolves to the same request.
      requestId: readHeader(errorRequest.headers, "x-request-id"),
      method: errorRequest.method,
      path: errorRequest.path,
      routePath: errorContext.routePath,
      routeType: errorContext.routeType,
      routerKind: errorContext.routerKind,
      renderSource: errorContext.renderSource,
    },
    error,
  );
};
