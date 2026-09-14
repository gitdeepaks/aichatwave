import { revalidateTag } from "next/cache";

const tag = (resource: string, userId: string): string => `${resource}:${userId}`;

export const threadListCacheTag = (userId: string): string => tag("threads", userId);
export const memoryListCacheTag = (userId: string): string => tag("memories", userId);
export const subscriptionCacheTag = (userId: string): string => tag("subscription", userId);
const ALL_SUBSCRIPTIONS_CACHE_TAG = "subscriptions";

export function invalidateThreadList(userId: string): void {
  revalidateTag(threadListCacheTag(userId), { expire: 0 });
}

export function invalidateMemoryList(userId: string): void {
  revalidateTag(memoryListCacheTag(userId), { expire: 0 });
}

export function invalidateSubscription(userId: string): void {
  revalidateTag(subscriptionCacheTag(userId), { expire: 0 });
  // A subscription can transfer owners. The global tag also expires the
  // previous owner's cached grant without adding a read-before-write race.
  revalidateTag(ALL_SUBSCRIPTIONS_CACHE_TAG, { expire: 0 });
}

export const subscriptionCacheTags = (userId: string): string[] => [
  ALL_SUBSCRIPTIONS_CACHE_TAG,
  subscriptionCacheTag(userId),
];
