/**
 * One typed wrapper for every API route.
 *
 * `app/api/chat/route.ts` previously did request-id resolution, body parsing,
 * validation, session lookup, error mapping, and logging inline. Repeating that
 * across a growing API surface is how an auth check eventually gets forgotten,
 * so it lives here once and every route is built from it.
 *
 * Route params, query string, and body each require an explicit schema — pass
 * `noParams` / `noQuery` / `noBody` when a route has none. Being explicit is
 * what lets the handler receive fully-typed values with no `unknown` in sight.
 */

import { z } from "zod";
import { requireSessionUserId } from "@/server/auth/session";
import {
  AppError,
  appErrorResponse,
  isAppError,
  toAppError,
  type AppErrorIssue,
} from "@/server/lib/app-error";
import { logger, type Logger } from "@/server/lib/logger";
import { resolveRequestId } from "@/server/lib/request-id";

export const noParams = z.object({});
export const noQuery = z.object({});
export const noBody = z.undefined();

/**
 * Next.js hands route params in as a promise of raw string segments — but only
 * for routes that have dynamic segments. A static route such as `/api/threads`
 * is invoked with no second argument at all, so both the context and its
 * `params` have to be treated as optional and defaulted to an empty object.
 */
type RawRouteContext = {
  params?: Promise<Record<string, string | string[] | undefined>>;
};

export type PublicRouteContext<TParams, TQuery, TBody> = {
  request: Request;
  requestId: string;
  params: TParams;
  query: TQuery;
  body: TBody;
  log: Logger;
};

export type RouteContext<TParams, TQuery, TBody> = PublicRouteContext<TParams, TQuery, TBody> & {
  userId: string;
};

type BaseConfig<TParams, TQuery, TBody> = {
  /** Used as the log `route` field, e.g. `GET /api/threads`. */
  name: string;
  params: z.ZodType<TParams>;
  query: z.ZodType<TQuery>;
  body: z.ZodType<TBody>;
};

export type RouteHandlerConfig<TParams, TQuery, TBody> = BaseConfig<TParams, TQuery, TBody> & {
  handler: (context: RouteContext<TParams, TQuery, TBody>) => Promise<Response>;
};

export type PublicRouteHandlerConfig<TParams, TQuery, TBody> = BaseConfig<
  TParams,
  TQuery,
  TBody
> & {
  handler: (context: PublicRouteContext<TParams, TQuery, TBody>) => Promise<Response>;
};

export type RouteHandler = (request: Request, context?: RawRouteContext) => Promise<Response>;

/** A route that requires a signed-in user. This is the default for the whole API. */
export function createRouteHandler<TParams, TQuery, TBody>(
  config: RouteHandlerConfig<TParams, TQuery, TBody>,
): RouteHandler {
  return build(config, async (base) => {
    const userId = await requireSessionUserId();
    return config.handler({ ...base, userId, log: base.log.child({ userId }) });
  });
}

/**
 * A route that is reachable without a session. Deliberately a separate function
 * rather than a flag, so "public" is a visible choice at the call site and
 * cannot be reached by forgetting an option.
 */
export function createPublicRouteHandler<TParams, TQuery, TBody>(
  config: PublicRouteHandlerConfig<TParams, TQuery, TBody>,
): RouteHandler {
  return build(config, (base) => config.handler(base));
}

function build<TParams, TQuery, TBody>(
  config: BaseConfig<TParams, TQuery, TBody>,
  run: (base: PublicRouteContext<TParams, TQuery, TBody>) => Promise<Response>,
): RouteHandler {
  return async (request, rawContext) => {
    const requestId = resolveRequestId(request.headers);
    const log = logger.child({ requestId, route: config.name });

    try {
      const rawParams = rawContext?.params === undefined ? {} : await rawContext.params;
      const params = parseOrThrow(config.params, rawParams, "params");
      const query = parseOrThrow(
        config.query,
        Object.fromEntries(new URL(request.url).searchParams),
        "query",
      );
      const body = parseOrThrow(config.body, await readJsonBody(request), "body");

      const response = await run({ request, requestId, params, query, body, log });
      return withRequestId(response, requestId);
    } catch (error) {
      const appError = toAppError(error);
      const level = appError.status >= 500 ? "error" : "warn";
      log[level](
        "route.request_failed",
        { code: appError.code, status: appError.status },
        isAppError(error) ? error.cause : error,
      );
      return appErrorResponse(appError, requestId);
    }
  };
}

/** Returns `undefined` for verbs without a body, so `noBody` validates cleanly. */
async function readJsonBody(request: Request): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "DELETE") {
    return undefined;
  }

  const raw = await request.text();
  if (raw.trim().length === 0) return undefined;

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new AppError("INVALID_JSON", "Request body must be valid JSON.", { cause: error });
  }
}

function parseOrThrow<TValue>(
  schema: z.ZodType<TValue>,
  value: unknown,
  source: "params" | "query" | "body",
): TValue {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const issues: AppErrorIssue[] = result.error.issues.map((issue) => ({
    path: [source, ...issue.path.map(String)].join("."),
    message: issue.message,
  }));

  throw new AppError("INVALID_REQUEST", `Invalid request ${source}.`, { issues });
}

/**
 * Guarantees the correlation id reaches the client. Rebuilds the response only
 * when the header is missing; the body is passed through untouched, so
 * streaming responses stay streaming.
 */
function withRequestId(response: Response, requestId: string): Response {
  if (response.headers.has("x-request-id")) return response;

  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function jsonResponse<TData>(data: TData, status = 200): Response {
  return Response.json(data, { status });
}

export function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}
