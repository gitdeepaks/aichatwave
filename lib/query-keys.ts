export const subscriptionQueryKey = (userId: string | null | undefined) =>
  ["customer_subscription", userId] as const;

export const THREADS_QUERY_KEY = ["threads"] as const;

export const threadsQueryKey = (view: "active" | "archived", pinned?: boolean) =>
  [...THREADS_QUERY_KEY, view, pinned ?? "all"] as const;

export const threadSearchQueryKey = (query: string) =>
  [...THREADS_QUERY_KEY, "search", query] as const;

/**
 * A thread's transcript.
 *
 * Deliberately *not* under `THREADS_QUERY_KEY`. The sidebar invalidates that
 * prefix whenever a turn settles — the generated title and the new ordering
 * both live there — and a transcript sharing the prefix would be thrown away
 * on every single answer, which is the opposite of what Phase L is for.
 */
export const THREAD_MESSAGES_QUERY_KEY = ["thread_messages"] as const;

export const threadMessagesQueryKey = (threadId: string) =>
  [...THREAD_MESSAGES_QUERY_KEY, threadId] as const;

/**
 * Long-term memory consent.
 *
 * Not keyed by user id, unlike `subscriptionQueryKey`. The query is only
 * enabled for a signed-in session and every route it reads is scoped to that
 * session's user server-side, so the id would be decoration — and the whole
 * cache is discarded on sign-out anyway.
 */
export const memoryConsentQueryKey = () => ["memory_consent"] as const;
