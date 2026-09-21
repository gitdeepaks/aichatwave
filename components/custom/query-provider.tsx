"use client";

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * How long a cached result is served without a refetch.
 *
 * Thirty seconds, not zero. React Query's default marks everything stale the
 * instant it arrives, so returning to a thread refetched immediately — which
 * is the round trip Phase L exists to remove. A short window is enough to make
 * a switch instant while keeping the sidebar honest, and every mutation in the
 * sidebar now updates the cache directly rather than waiting for a refetch to
 * tell it what it already knows.
 */
const STALE_TIME_MS = 30_000;

/**
 * How long an unused result is kept in memory.
 *
 * Long enough that moving between a handful of conversations never evicts one
 * of them. The disk cache outlives this, so the ceiling here is about memory
 * rather than about what survives.
 */
const GC_TIME_MS = 30 * 60 * 1000;

/**
 * The query client for the whole app.
 *
 * Deliberately knows nothing about the session or about IndexedDB. It is
 * mounted in the root layout, so anything it imports is in the bundle of every
 * route including the landing page — and the first version of this file
 * imported `useAuth` for the persistence wiring, which pulled Clerk's client
 * runtime into `/`, `/sign-in`, `/sign-up` and `/_not-found` and added 282KB to
 * each. `pnpm bundle:check` failed on all four, which is the budget doing its
 * job: a phase about speed does not get to make the first paint heavier.
 *
 * The persistence lives in `QueryCacheSync`, mounted in the workspace layout,
 * where both the session and the cached queries actually are.
 */
export default function QueryProvider({ children }: { children: React.ReactNode }) {
  // Keep the same QueryClient instance for the lifetime of this provider.
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: STALE_TIME_MS,
            gcTime: GC_TIME_MS,
            // The data is already on screen; refetching because a window
            // regained focus is a spinner for something the user did not ask
            // for. Reconnect is kept, because coming back online is the one
            // moment the cache is most likely to be wrong.
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
