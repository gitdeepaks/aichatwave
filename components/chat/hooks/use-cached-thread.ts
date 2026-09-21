"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ThreadListPages } from "@/lib/cache/query-persistence";
import { findThread } from "@/lib/threads/thread-cache";
import { THREADS_QUERY_KEY } from "@/lib/query-keys";

/**
 * A thread's title, from whichever cached sidebar list happens to hold it.
 *
 * Searched across every list variant rather than one: a thread is in the
 * active list or the archived one, and in the pinned variant or the unpinned
 * one, and the caller does not know which. There are at most a handful of
 * cached lists and each holds tens of rows, so this is a scan over a few
 * hundred objects — cheaper than the round trip it replaces by orders of
 * magnitude.
 *
 * `useSyncExternalStore` rather than a query, because there is nothing to
 * fetch: the answer is whatever the sidebar has already loaded, and the
 * component needs to re-read it when that changes. Returning a string keeps
 * the snapshot comparison by value, so an unrelated cache update does not
 * re-render this.
 */
export function useCachedThreadTitle(threadId: string): string | null {
  const queryClient = useQueryClient();

  const subscribe = useCallback(
    (onStoreChange: () => void) => queryClient.getQueryCache().subscribe(onStoreChange),
    [queryClient],
  );

  const getSnapshot = useCallback((): string | null => {
    for (const [, pages] of queryClient.getQueriesData<ThreadListPages>({
      queryKey: THREADS_QUERY_KEY,
    })) {
      const thread = findThread(pages, threadId);
      if (thread !== null) return thread.title;
    }
    return null;
  }, [queryClient, threadId]);

  // No title on the server: the cache is a browser artefact, and rendering one
  // value there and another on hydration is a mismatch for no gain.
  const getServerSnapshot = useCallback((): string | null => null, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
