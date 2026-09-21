"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { hydratePersistedQueries, persistQueryCache } from "@/lib/cache/query-persistence";

/**
 * Connects the query cache to its disk, for as long as the workspace is open.
 *
 * Mounted in the workspace layout rather than beside `QueryProvider` in the
 * root layout, and the reason is measurable: the root layout is in every
 * route's bundle, `useAuth` pulls Clerk's client runtime with it, and putting
 * this there added 282KB to the landing page and the auth screens — which
 * `pnpm bundle:check` refused. Nothing outside `/app` caches anything, so
 * nothing outside `/app` needs this.
 *
 * Renders nothing. It is two effects: read this user's cache in at boot, and
 * mirror successful results back out as they change.
 */
export function QueryCacheSync() {
  const queryClient = useQueryClient();
  const { isLoaded, userId } = useAuth();

  useEffect(() => {
    if (!isLoaded || userId === null) return;

    // Started rather than awaited: hydration fills a cache that is read on
    // every later render, and blocking the tree on an IndexedDB read would
    // slow the one path — a cold load — that this cache does not help.
    // Landing after an unmount is harmless: it writes into a client that is
    // already being discarded.
    void hydratePersistedQueries({ client: queryClient, userId });

    return persistQueryCache({ client: queryClient, userId });
  }, [isLoaded, queryClient, userId]);

  return null;
}
