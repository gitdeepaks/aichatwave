/**
 * Reads a thrown provider error and says what kind of failure it is.
 *
 * Three SDKs report the same four conditions in three different shapes: the
 * OpenAI and Anthropic clients carry a numeric `status`, the Google client
 * puts the code in the message text, and a dead socket arrives from `undici`
 * as a `TypeError` with an errno on its `cause`. Every retry decision in this
 * app depends on telling those apart, so the narrowing is in one tested place
 * rather than repeated at the call site as `error.status === 429`.
 *
 * Kept free of `lib/env.ts` and of the provider SDKs so it can be exercised
 * from a test with plain objects.
 */

import { z } from "zod";
import type { ProviderFailureKind } from "@/lib/ai/resilience-policy";

/** Socket-level failures. All of them mean "the provider was not reached", not "it refused". */
const NETWORK_ERROR_CODES: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/**
 * The fields the three SDKs put their failure information in, read through Zod
 * for the same reason every other external payload in this codebase is: a
 * thrown value is a payload, and reaching into it with property access is how
 * an `any` gets in.
 *
 * `.catch({})` because a non-object throw — a string, a null — is a legitimate
 * thing to classify and must not become an exception of its own.
 */
const providerErrorSchema = z
  .object({
    name: z.string().optional(),
    message: z.string().optional(),
    code: z.string().optional(),
    type: z.string().optional(),
    status: z.number().optional(),
    statusCode: z.number().optional(),
    cause: z.unknown().optional(),
  })
  .catch({});

type ProviderErrorFields = z.infer<typeof providerErrorSchema>;

function readFields(error: unknown): ProviderErrorFields {
  return providerErrorSchema.parse(error);
}

/** The HTTP status, from wherever this provider's SDK decided to put it. */
function readStatus(fields: ProviderErrorFields): number | null {
  const direct = fields.status ?? fields.statusCode;
  if (direct !== undefined) return direct;

  // Google's client has no status field; it prefixes the message instead, e.g.
  // "[GoogleGenerativeAI Error]: ... [503 Service Unavailable]".
  if (fields.message === undefined) return null;
  const match = /\[(\d{3})\s/.exec(fields.message);
  const captured = match?.[1];
  return captured === undefined ? null : Number.parseInt(captured, 10);
}

function readErrorCode(fields: ProviderErrorFields): string | null {
  return fields.code ?? fields.type ?? null;
}

function isAbortLike(fields: ProviderErrorFields): boolean {
  return fields.name === "AbortError" || fields.name === "APIUserAbortError";
}

function isTimeoutLike(fields: ProviderErrorFields): boolean {
  if (fields.name === "TimeoutError") return true;
  const code = readErrorCode(fields);
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") return true;
  return fields.message !== undefined && /timed? ?out/i.test(fields.message);
}

function isNetworkLike(fields: ProviderErrorFields): boolean {
  const code = readErrorCode(fields);
  if (code !== null && NETWORK_ERROR_CODES.has(code)) return true;

  if (
    fields.message !== undefined &&
    /fetch failed|socket hang up|network error/i.test(fields.message)
  ) {
    return true;
  }

  // `undici` reports the real reason one level down.
  const causeCode = readErrorCode(readFields(fields.cause));
  return causeCode !== null && NETWORK_ERROR_CODES.has(causeCode);
}

/**
 * `insufficient_quota` is a 429 that no amount of waiting fixes — the account
 * is out of credit. Retrying it burns the turn's deadline to arrive at the
 * same answer, so it is classified as permanent despite the status.
 */
function isBillingExhaustion(fields: ProviderErrorFields): boolean {
  if (readErrorCode(fields) === "insufficient_quota") return true;
  return (
    fields.message !== undefined &&
    /insufficient_quota|exceeded your current quota/i.test(fields.message)
  );
}

export function classifyProviderFailure(error: unknown): ProviderFailureKind {
  const fields = readFields(error);

  // Cancellation is checked first and on the whole chain: a stop that lands
  // mid-request surfaces as a socket error at the bottom and an abort at the
  // top, and treating it as an outage would trip the breaker on user behavior.
  if (isAbortLike(fields) || isAbortLike(readFields(fields.cause))) return "aborted";

  if (isBillingExhaustion(fields)) return "permanent";
  if (isTimeoutLike(fields)) return "timeout";

  const status = readStatus(fields);
  if (status === 429) return "rate_limited";
  if (status !== null && status >= 500) return "upstream_unavailable";
  if (status !== null && status >= 400) return "permanent";

  if (isNetworkLike(fields)) return "upstream_unavailable";

  // Unrecognized. Treated as permanent rather than retried: an unknown failure
  // repeated three times is three times the cost and the same outcome, and the
  // fleet-wide version of that guess is a retry storm.
  return "permanent";
}

/**
 * A failure that has been classified but not yet rethrown.
 *
 * The original thrown value is held in a closure rather than in a field. That
 * is not a trick to dodge constraint C1 — it is what the constraint asks for:
 * an untyped value is narrowed at the edge (`classifyProviderFailure`) and
 * never stored as `unknown` in a named type. What the caller keeps is the
 * classification, plus the ability to re-raise exactly what the SDK produced,
 * which matters because the identity of an `AbortError` is what upstream code
 * checks.
 */
export type ProviderFailure = {
  readonly kind: ProviderFailureKind;
  readonly rethrow: () => never;
};

export function toProviderFailure(error: unknown): ProviderFailure {
  return {
    kind: classifyProviderFailure(error),
    rethrow: () => {
      throw error;
    },
  };
}
