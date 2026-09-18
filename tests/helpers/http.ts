/**
 * Calling a route handler the way Next.js calls it.
 *
 * The subject is the real `GET`/`POST`/`PATCH`/`DELETE` a route file exports,
 * built by `createRouteHandler`, so every test goes through the whole edge:
 * the cross-origin guard, params/query/body validation, the session lookup,
 * the typed error envelope, the `x-request-id` header, and the SLO counter.
 * Nothing about the handler is reimplemented here.
 *
 * Requests carry `origin` and `host` for the configured app URL, because
 * `assertSameOrigin` rejects a write that names a foreign host — a test that
 * forgot them would get a 403 for the wrong reason.
 */

import { TEST_APP_URL } from "./environment";
import { z } from "zod";
import { APP_ERROR_STATUS, type AppErrorCode } from "@/server/lib/app-error";

/** The shape Next hands a route handler for a dynamic segment. */
type RouteContext = { params?: Promise<Record<string, string | string[] | undefined>> };

type RouteHandler = (request: Request, context?: RouteContext) => Promise<Response>;

type ApiRequestInit = {
  /** Serialized as JSON. Pass `rawBody` instead to send something invalid on purpose. */
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
  /** Overrides the `origin` header; `null` omits it, as a non-browser client does. */
  origin?: string | null;
};

export function apiRequest(
  method: string,
  pathAndQuery: string,
  init: ApiRequestInit = {},
): Request {
  const url = new URL(pathAndQuery, TEST_APP_URL);
  const headers = new Headers({ host: new URL(TEST_APP_URL).host, ...init.headers });

  if (init.origin !== null) {
    headers.set("origin", init.origin ?? TEST_APP_URL);
  }

  const body = init.rawBody ?? (init.body === undefined ? undefined : JSON.stringify(init.body));

  if (body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return new Request(url, { method, headers, ...(body === undefined ? {} : { body }) });
}

/** Invokes a route handler, passing dynamic segments the way Next does. */
export function callRoute(
  handler: RouteHandler,
  request: Request,
  params: Record<string, string | string[] | undefined> = {},
): Promise<Response> {
  return handler(request, { params: Promise.resolve(params) });
}

/**
 * The client's own reading of the error envelope.
 *
 * Declared here rather than imported from the server so the assertion checks
 * the wire shape instead of restating it: if `appErrorBody` ever stops emitting
 * `requestId`, every one of these tests fails.
 */
const appErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().min(1),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    retryAfterSeconds: z.number().int().positive().optional(),
  }),
});

type TestAppError = z.infer<typeof appErrorEnvelopeSchema>["error"];

/** The typed error envelope a failed call returned, parsed rather than trusted. */
export async function readAppError(response: Response): Promise<TestAppError> {
  const payload: unknown = await response.json();
  const parsed = appErrorEnvelopeSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error(
      `Expected an AppError envelope, got ${JSON.stringify(payload)} (HTTP ${response.status}).`,
    );
  }

  return parsed.data.error;
}

/**
 * Asserts the call failed with `code`, and hands the envelope back.
 *
 * The status is not a parameter: it is looked up from `APP_ERROR_STATUS`, so
 * every assertion also checks that the code still maps to the status the client
 * is written against.
 */
export async function expectAppError(
  response: Response,
  code: AppErrorCode,
): Promise<TestAppError> {
  const error = await readAppError(response);
  const expectedStatus = APP_ERROR_STATUS[code];

  if (error.code !== code || response.status !== expectedStatus) {
    throw new Error(
      `Expected ${code} (${expectedStatus}), ` +
        `got ${error.code} (${response.status}): ${error.message}`,
    );
  }

  return error;
}

/** The JSON body of a successful call, unparsed — the caller applies its contract schema. */
export function readJson(response: Response): Promise<unknown> {
  return response.json();
}
