/**
 * Structured logger wrapper. All server-side logging goes through this module
 * so every line is a single JSON object carrying request/user/thread context.
 *
 * Since Phase H every line also carries the active trace and span ids when
 * something is recording. That is the join between the two halves of an
 * investigation: a user quotes a request id, `grep` finds the line, and the
 * line names the trace whose route → graph → LLM → tool tree explains it.
 * The reader is injected rather than imported so this module stays free of
 * OpenTelemetry and its test needs no SDK.
 */

import { currentTraceCorrelation } from "@/server/observability/tracing";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContextValue = string | number | boolean | null | undefined;
export type LogContext = Record<string, LogContextValue>;

export type LogEntry = {
  level: LogLevel;
  time: string;
  message: string;
  context: LogContext;
  error?: SerializedError;
};

export type SerializedError = {
  name: string;
  message: string;
  stack?: string;
};

export type LogSink = (entry: LogEntry) => void;

export type Logger = {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext, cause?: unknown) => void;
  error: (message: string, context?: LogContext, cause?: unknown) => void;
  child: (context: LogContext) => Logger;
};

export function serializeError(cause: unknown): SerializedError {
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      ...(cause.stack === undefined ? {} : { stack: cause.stack }),
    };
  }
  return { name: "UnknownError", message: stringifyUnknown(cause) };
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/* eslint-disable no-console -- the logger is the single sanctioned console boundary */
const defaultSink: LogSink = (entry) => {
  const line = JSON.stringify(entry);
  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn") console.warn(line);
  else console.log(line);
};
/* eslint-enable no-console */

/**
 * Supplies the ids of whatever is currently being traced, or an empty object.
 *
 * A function rather than a value because it is read per line: one logger
 * instance spans many requests, and the active span changes underneath it.
 */
export type TraceContextReader = () => LogContext;

const noTraceContext: TraceContextReader = () => ({});

export function createLogger(
  base: LogContext = {},
  sink: LogSink = defaultSink,
  readTraceContext: TraceContextReader = noTraceContext,
): Logger {
  const emit = (level: LogLevel, message: string, context?: LogContext, cause?: unknown): void => {
    sink({
      level,
      time: new Date().toISOString(),
      message,
      // Trace ids first, so an explicit field of the same name always wins —
      // nothing about correlation may overwrite what a call site chose to say.
      context: { ...readTraceContext(), ...base, ...context },
      ...(cause === undefined ? {} : { error: serializeError(cause) }),
    });
  };

  return {
    debug: (message, context) => emit("debug", message, context),
    info: (message, context) => emit("info", message, context),
    warn: (message, context, cause) => emit("warn", message, context, cause),
    error: (message, context, cause) => emit("error", message, context, cause),
    child: (context) => createLogger({ ...base, ...context }, sink, readTraceContext),
  };
}

export const logger = createLogger({}, defaultSink, currentTraceCorrelation);
