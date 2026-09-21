"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { threadsApi } from "@/lib/api/client";
import type { MessageListResponse } from "@/lib/api/contracts";
import type { MessageWindow } from "@/lib/cache/query-persistence";
import { threadMessagesQueryKey } from "@/lib/query-keys";

/**
 * How many messages the first window carries.
 *
 * The same 50 the server page used to render. Large enough that scrolling back
 * is rare, small enough that the payload — and the IndexedDB record behind it —
 * stays a few tens of kilobytes rather than a whole conversation.
 */
export const TRANSCRIPT_WINDOW_SIZE = 50;

export type ThreadTranscript = {
  /** The newest window, or null when it has never been fetched or cached. */
  readonly window: MessageWindow | null;
  /** True while the first fetch for this thread is in flight with nothing to show. */
  readonly isPending: boolean;
  readonly error: Error | null;
};

/**
 * The thread's newest messages, from the client cache first.
 *
 * This is the read the page used to do on the server. Moving it here is what
 * makes a revisit instant: the cache is hydrated from IndexedDB at boot
 * (`lib/cache/query-persistence.ts`), so a thread the user has opened before
 * has its transcript in memory before the click lands, and the refetch that
 * follows is a revalidation nobody waits for.
 *
 * `enabled` is false for a thread that does not exist yet — the home page mints
 * an id for the conversation the user is about to start — because fetching the
 * history of a thread with no history is a round trip whose only possible
 * answer is the empty list we already have.
 */
export function useThreadTranscript(params: {
  readonly threadId: string;
  readonly isNewThread: boolean;
}): ThreadTranscript {
  const query = useQuery({
    queryKey: threadMessagesQueryKey(params.threadId),
    queryFn: ({ signal }) =>
      threadsApi.messages(params.threadId, { limit: TRANSCRIPT_WINDOW_SIZE, signal }),
    enabled: !params.isNewThread,
  });

  return {
    window: query.data ?? null,
    // `isPending` alone is true for a disabled query too, which is not the same
    // thing as "loading" — it is "never going to load", and the empty state is
    // the right thing to show for it.
    isPending: query.isLoading,
    error: query.error,
  };
}

/**
 * The cached window for a thread, read synchronously during render.
 *
 * The hook above delivers data through React state, which means one render
 * with nothing and a second with the transcript — two frames, and a visible
 * flash of the skeleton on a switch that had the answer all along. Reading the
 * cache directly is what lets the very first render of a warm thread already
 * contain its messages.
 */
export function readCachedWindow(
  client: QueryClient,
  threadId: string,
): MessageListResponse | null {
  return client.getQueryData<MessageWindow>(threadMessagesQueryKey(threadId)) ?? null;
}

/** `readCachedWindow`, bound to the provider's client. */
export function useCachedWindowReader(): (threadId: string) => MessageListResponse | null {
  const client = useQueryClient();
  return (threadId) => readCachedWindow(client, threadId);
}
