export const subscriptionQueryKey = (userId: string | null | undefined) =>
  ["customer_subscription", userId] as const;

export const THREADS_QUERY_KEY = ["threads"] as const;

export const threadsQueryKey = (view: "active" | "archived", pinned?: boolean) =>
  [...THREADS_QUERY_KEY, view, pinned ?? "all"] as const;

export const threadSearchQueryKey = (query: string) =>
  [...THREADS_QUERY_KEY, "search", query] as const;
