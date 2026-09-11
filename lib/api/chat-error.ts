/**
 * Reading the server's typed error out of what the AI SDK throws.
 *
 * `DefaultChatTransport` does not model HTTP failures: on a non-2xx it throws
 * `new Error(await response.text())`, so the status code, the headers, and the
 * `Retry-After` are all gone by the time `useChat` surfaces an error — what
 * survives is the response body, as a string, in `error.message`.
 *
 * That body is this app's own `AppErrorBody` envelope, which is why the server
 * mirrors `retryAfterSeconds` into it rather than relying on the header alone.
 * Parsing it back here is what lets the composer distinguish "you are sending
 * too fast" from "you are out of messages" from "something broke" — three
 * situations with three different things for the user to do, which all looked
 * identical as a generic red toast.
 */

import { z } from "zod";
import { parseJsonText } from "@/lib/json";

const chatErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    retryAfterSeconds: z.number().int().positive().optional(),
  }),
});

/**
 * What the user can actually do about it. Deliberately coarser than the
 * server's `AppErrorCode`: codes that call for the same action collapse into
 * one kind, so the UI does not grow a branch per code.
 */
export type ChatErrorKind =
  | "rate-limited"
  | "quota-exceeded"
  | "model-access-denied"
  | "unauthorized"
  | "unavailable"
  | "unknown";

export type ChatError = {
  kind: ChatErrorKind;
  /** Safe to show: every `AppError.message` is written for the client. */
  message: string;
  retryAfterSeconds: number | null;
  requestId: string | null;
};

const KIND_BY_CODE: Record<string, ChatErrorKind> = {
  RATE_LIMITED: "rate-limited",
  QUOTA_EXCEEDED: "quota-exceeded",
  MODEL_ACCESS_DENIED: "model-access-denied",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "unauthorized",
  SERVICE_UNAVAILABLE: "unavailable",
  UPSTREAM_ERROR: "unavailable",
};

/**
 * Classifies a chat failure, or returns null when there was none.
 *
 * An unparseable message is not a failure to report differently — a network
 * drop throws a plain `Error` with no envelope — so it degrades to `unknown`
 * carrying whatever text there was.
 */
export function parseChatError(error: Error | null | undefined): ChatError | null {
  if (!error) return null;

  const parsed = chatErrorEnvelopeSchema.safeParse(parseJsonText(error.message));
  if (!parsed.success) {
    return {
      kind: "unknown",
      message: error.message.length > 0 ? error.message : "Something went wrong.",
      retryAfterSeconds: null,
      requestId: null,
    };
  }

  const { code, message, requestId, retryAfterSeconds } = parsed.data.error;

  return {
    kind: KIND_BY_CODE[code] ?? "unknown",
    message,
    retryAfterSeconds: retryAfterSeconds ?? null,
    requestId: requestId ?? null,
  };
}

/** "in 45s" / "in 3m" — a wait the user can read at a glance. */
export function formatRetryDelay(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.ceil(seconds / 3600)}h`;
  return `${Math.ceil(seconds / 86_400)}d`;
}
