export const subscriptionQueryKey = (userId: string | null | undefined) =>
  ["customer_subscription", userId] as const;

export const THREADS_QUERY_KEY = ["threads"] as const;
