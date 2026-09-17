/**
 * Narrowing a thrown `unknown` into the facts `classifyIncident` judges on.
 *
 * Its own module, and deliberately free of `lib/env.ts`: the reporter that
 * uses it validates the whole process environment as an import side effect,
 * and the decision about what counts as an incident is exactly the thing that
 * should be testable without one.
 */

import type { ErrorFacts } from "@/lib/observability/incident-policy";
import { isAppError } from "@/server/lib/app-error";

/**
 * Narrows a thrown `unknown` into the facts the policy judges on.
 *
 * `aborted` covers both spellings the runtime uses: `AbortController` rejects
 * with a `DOMException` named `AbortError`, while the provider SDKs and this
 * app's own turn deadline throw plain `Error`s whose name is `AbortError` only
 * sometimes. The `cause` chain is walked one level because LangChain wraps.
 */
export function errorFacts(error: unknown): ErrorFacts {
  if (isAppError(error)) {
    return {
      name: error.name,
      appErrorCode: error.code,
      status: error.status,
      aborted: false,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      appErrorCode: null,
      status: null,
      aborted: isAbort(error) || isAbort(error.cause),
    };
  }

  return { name: "UnknownError", appErrorCode: null, status: null, aborted: false };
}

function isAbort(value: unknown): boolean {
  if (!(value instanceof Error)) return false;
  return value.name === "AbortError" || value.name === "TimeoutError";
}

/**
 * Whatever the call site knows. The same shape as a log context, on purpose:
 * an incident is a log line that also went somewhere else, and a reporter with
 * its own richer context type is a reporter whose fields drift out of the logs.
 * `requestId` should always be one of them — it is the join key a user quotes.
 */
