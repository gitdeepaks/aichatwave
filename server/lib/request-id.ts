const REQUEST_ID_MAX_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Honors an inbound `x-request-id` header when well-formed, otherwise mints one. */
export function resolveRequestId(headers: Headers): string {
  const fromHeader = headers.get("x-request-id")?.trim();
  if (
    fromHeader &&
    fromHeader.length <= REQUEST_ID_MAX_LENGTH &&
    REQUEST_ID_PATTERN.test(fromHeader)
  ) {
    return fromHeader;
  }
  return crypto.randomUUID();
}

/** Unique id attached to each individual LLM invocation for tracing. */
export function createLlmCallId(): string {
  return crypto.randomUUID();
}
