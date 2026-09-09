/**
 * Typed application error format shared by all route handlers and services.
 *
 * `AppError.message` is always safe to send to the client; internal details
 * belong in `cause` and are only surfaced through the structured logger.
 */

export const APP_ERROR_STATUS = {
  INVALID_JSON: 400,
  INVALID_REQUEST: 400,
  INVALID_CHAT_REQUEST: 400,
  INVALID_CURSOR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  MODEL_ACCESS_DENIED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  UPSTREAM_ERROR: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type AppErrorCode = keyof typeof APP_ERROR_STATUS;

export type AppErrorIssue = {
  path: string;
  message: string;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: (typeof APP_ERROR_STATUS)[AppErrorCode];
  readonly issues: AppErrorIssue[];

  constructor(
    code: AppErrorCode,
    message: string,
    options?: { issues?: AppErrorIssue[]; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = APP_ERROR_STATUS[code];
    this.issues = options?.issues ?? [];
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Wraps unknown thrown values into an `AppError` with a safe client message. */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value;
  return new AppError("INTERNAL_ERROR", "Something went wrong. Please try again.", {
    cause: value,
  });
}

export type AppErrorBody = {
  error: {
    code: AppErrorCode;
    message: string;
    requestId: string;
    issues?: AppErrorIssue[];
  };
};

export function appErrorBody(error: AppError, requestId: string): AppErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      requestId,
      ...(error.issues.length > 0 ? { issues: error.issues } : {}),
    },
  };
}

export function appErrorResponse(error: AppError, requestId: string): Response {
  return Response.json(appErrorBody(error, requestId), {
    status: error.status,
    headers: { "x-request-id": requestId },
  });
}
