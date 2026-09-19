export const subscriptionQueryKey = (userId: string | null | undefined) =>
  ["customer_subscription", userId] as const;

export const THREADS_QUERY_KEY = ["threads"] as const;

export const threadsQueryKey = (view: "active" | "archived", pinned?: boolean) =>
  [...THREADS_QUERY_KEY, view, pinned ?? "all"] as const;

export const threadSearchQueryKey = (query: string) =>
  [...THREADS_QUERY_KEY, "search", query] as const;

/**
 * Long-term memory consent.
 *
 * Not keyed by user id, unlike `subscriptionQueryKey`. The query is only
 * enabled for a signed-in session and every route it reads is scoped to that
 * session's user server-side, so the id would be decoration — and the whole
 * cache is discarded on sign-out anyway.
 */
export const memoryConsentQueryKey = () => ["memory_consent"] as const;
