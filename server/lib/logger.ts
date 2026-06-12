/**
 * Structured logger wrapper. All server-side logging goes through this module
 * so every line is a single JSON object carrying request/user/thread context.
 */

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

export function createLogger(base: LogContext = {}, sink: LogSink = defaultSink): Logger {
  const emit = (level: LogLevel, message: string, context?: LogContext, cause?: unknown): void => {
    sink({
      level,
      time: new Date().toISOString(),
      message,
      context: { ...base, ...context },
      ...(cause === undefined ? {} : { error: serializeError(cause) }),
    });
  };

  return {
    debug: (message, context) => emit("debug", message, context),
    info: (message, context) => emit("info", message, context),
    warn: (message, context, cause) => emit("warn", message, context, cause),
    error: (message, context, cause) => emit("error", message, context, cause),
    child: (context) => createLogger({ ...base, ...context }, sink),
  };
}

export const logger = createLogger();
