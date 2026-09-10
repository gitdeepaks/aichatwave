/**
 * Typed browser client for the app's HTTP API.
 *
 * Every response is parsed through the schema in `lib/api/contracts`, so a
 * server-side shape change surfaces as a caught error at the boundary instead
 * of `undefined` appearing three components deep. `fetch` hands back `any`;
 * this module is where that stops.
 */

import { z } from "zod";
import type { JsonValue } from "@/lib/json";
import {
  memoryListResponseSchema,
  messageListResponseSchema,
  threadListResponseSchema,
  threadResponseSchema,
  type CreateThreadRequest,
  type MemoryDto,
  type MessageListResponse,
  type ThreadDto,
  type ThreadListResponse,
  type UpdateThreadRequest,
} from "@/lib/api/contracts";

/** The error envelope every route returns via `appErrorResponse`. */
const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;

  constructor(params: { status: number; code: string; message: string; requestId: string }) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.code = params.code;
    this.requestId = params.requestId;
  }
}

/**
 * A request body: an object of JSON values.
 *
 * Typed as JSON rather than `unknown` — a body is serialized, so a value that
 * cannot survive `JSON.stringify` is a mistake, not a maybe. Fields are
 * `| undefined` because the request contracts are Zod-derived and an optional
 * field there is "present and undefined"; `JSON.stringify` drops those.
 */
type RequestBody = { [field: string]: JsonValue | undefined };

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: RequestBody;
  signal?: AbortSignal;
};

async function request<TData>(
  path: string,
  schema: z.ZodType<TData>,
  options: RequestOptions = {},
): Promise<TData> {
  const method = options.method ?? "GET";

  const response = await fetch(path, {
    method,
    headers: options.body === undefined ? {} : { "content-type": "application/json" },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return schema.parse(undefined);
  }

  return schema.parse(await response.json());
}

async function toApiError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get("x-request-id") ?? "unknown";

  const parsed = apiErrorBodySchema.safeParse(await response.json().catch(() => null));
  if (parsed.success) {
    return new ApiError({
      status: response.status,
      code: parsed.data.error.code,
      message: parsed.data.error.message,
      requestId: parsed.data.error.requestId,
    });
  }

  return new ApiError({
    status: response.status,
    code: "UNKNOWN",
    message: `Request failed with status ${response.status}.`,
    requestId,
  });
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return query.length > 0 ? `?${query}` : "";
}

export const threadsApi = {
  list: (params: { cursor?: string; limit?: number; includeArchived?: boolean } = {}) =>
    request<ThreadListResponse>(`/api/threads${buildQuery(params)}`, threadListResponseSchema),

  create: async (body: CreateThreadRequest = {}): Promise<ThreadDto> => {
    const result = await request(`/api/threads`, threadResponseSchema, {
      method: "POST",
      body,
    });
    return result.thread;
  },

  get: async (threadId: string): Promise<ThreadDto> => {
    const result = await request(`/api/threads/${threadId}`, threadResponseSchema);
    return result.thread;
  },

  update: async (threadId: string, body: UpdateThreadRequest): Promise<ThreadDto> => {
    const result = await request(`/api/threads/${threadId}`, threadResponseSchema, {
      method: "PATCH",
      body,
    });
    return result.thread;
  },

  remove: (threadId: string): Promise<void> =>
    request(`/api/threads/${threadId}`, z.void(), { method: "DELETE" }),

  messages: (threadId: string, params: { cursor?: string; limit?: number } = {}) =>
    request<MessageListResponse>(
      `/api/threads/${threadId}/messages${buildQuery(params)}`,
      messageListResponseSchema,
    ),
};

const billingUrlResponseSchema = z.object({ url: z.url() });

/**
 * Checkout and portal used to be `authClient.checkout()` / `.customer.portal()`
 * from the Polar Better Auth plugin. With Clerk there is no such plugin, so the
 * server mints the URL and the browser navigates to it.
 */
export const billingApi = {
  startProCheckout: async (): Promise<string> => {
    const result = await request(`/api/billing/checkout`, billingUrlResponseSchema, {
      method: "POST",
    });
    return result.url;
  },

  openPortal: async (): Promise<string> => {
    const result = await request(`/api/billing/portal`, billingUrlResponseSchema, {
      method: "POST",
    });
    return result.url;
  },
};

export const memoriesApi = {
  list: async (): Promise<MemoryDto[]> => {
    const result = await request(`/api/memories`, memoryListResponseSchema);
    return result.memories;
  },

  remove: (memoryId: string): Promise<void> =>
    request(`/api/memories/${memoryId}`, z.void(), { method: "DELETE" }),
};
