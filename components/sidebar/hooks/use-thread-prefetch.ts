"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { TRANSCRIPT_WINDOW_SIZE } from "@/components/chat/hooks/use-thread-transcript";
import { threadsApi } from "@/lib/api/client";
import { markInteractionStart, threadSwitchMark } from "@/lib/perf/client-latency";
import { threadMessagesQueryKey } from "@/lib/query-keys";
import { chatRoute } from "@/lib/routes";

/**
 * How long a prefetched transcript is considered fresh enough to reuse.
 *
 * Long enough that hovering, thinking, and then clicking does not fetch twice;
 * short enough that a thread left open in another tab is revalidated when it
 * is next opened here.
 */
const PREFETCH_STALE_TIME_MS = 60_000;

export type ThreadIntentHandlers = {
  readonly onPointerEnter: () => void;
  readonly onFocus: () => void;
  readonly onTouchStart: () => void;
  readonly onClick: () => void;
};

/**
 * Prefetch on intent (Phase L item 2).
 *
 * A sidebar row is hovered, focused or touched long before it is clicked, and
 * both halves of what the next screen needs can be fetched in that gap: the
 * route's own payload, and the thread's first message page. By the time the
 * click lands, a switch that would have been two round trips is a cache read.
 *
 * `router.prefetch` rather than `<Link prefetch>`: the workspace layout is
 * authenticated, so the thread route is a dynamic one, and an automatic
 * viewport prefetch of a dynamic route stops at the loading boundary. An
 * explicit prefetch takes the whole segment — which is cheap now that the
 * segment carries no data of its own.
 *
 * Both halves are guarded against repetition. A user sweeping the pointer down
 * a list of thirty conversations should warm each of them once, not once per
 * `pointerenter` the browser chooses to emit.
 */
export function useThreadPrefetch(): (threadId: string) => ThreadIntentHandlers {
  const router = useRouter();
  const queryClient = useQueryClient();
  const warmed = useRef(new Set<string>());

  const prefetch = useCallback(
    (threadId: string) => {
      if (warmed.current.has(threadId)) return;
      warmed.current.add(threadId);

      router.prefetch(chatRoute(threadId));
      void queryClient.prefetchQuery({
        queryKey: threadMessagesQueryKey(threadId),
        queryFn: ({ signal }) =>
          threadsApi.messages(threadId, { limit: TRANSCRIPT_WINDOW_SIZE, signal }),
        staleTime: PREFETCH_STALE_TIME_MS,
      });
    },
    [queryClient, router],
  );

  return useCallback(
    (threadId: string) => ({
      onPointerEnter: () => {
        prefetch(threadId);
      },
      onFocus: () => {
        prefetch(threadId);
      },
      onTouchStart: () => {
        prefetch(threadId);
      },
      // The click is also where the switch's clock starts. Marked here rather
      // than inside the navigation so the measurement covers everything the
      // user waits through, including the router's own work.
      onClick: () => {
        markInteractionStart(threadSwitchMark(threadId));
      },
    }),
    [prefetch],
  );
}
