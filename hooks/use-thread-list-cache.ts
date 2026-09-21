"use client";

import { useMemo } from "react";
import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { z } from "zod";
import { threadViewSchema, type ThreadDto } from "@/lib/api/contracts";
import type { ThreadListPages } from "@/lib/cache/query-persistence";
import { toJsonQueryKey } from "@/lib/cache/query-persistence";
import { THREADS_QUERY_KEY } from "@/lib/query-keys";
import {
  belongsInScope,
  findThread,
  insertThreadIntoPages,
  removeThreadFromPages,
  type ThreadListScope,
} from "@/lib/threads/thread-cache";

/**
 * Every cached sidebar list, and the thread rows inside them.
 *
 * Phase L item 3: the sidebar's mutations used to call `invalidateQueries` and
 * wait. Renaming a conversation therefore cost a round trip before the new name
 * appeared — for a string the user had just typed — and pin, archive and delete
 * each cost another. Every one of them is a change the client can compute, so
 * every one of them now applies here first and reconciles behind the response.
 *
 * The list is cached in several variants at once (active, archived, pinned,
 * unpinned) and a mutation can move a thread between them. Rather than knowing
 * which variant is on screen, each operation is applied to all of them and each
 * variant decides for itself whether the result still belongs — which is what
 * makes "archive" remove a row from one list and add it to another with no
 * special case anywhere.
 */

/** `["threads", view, pinned | "all"]` — the shape `threadsQueryKey` builds. */
const threadListKeySchema = z.tuple([
  z.literal(THREADS_QUERY_KEY[0]),
  threadViewSchema,
  z.union([z.boolean(), z.literal("all")]),
]);

/**
 * The scope a cached list represents, or null when the key is not one.
 *
 * `["threads", "search", q]` shares the prefix and is not a list of threads;
 * returning null for it is what keeps a rename from rewriting search results
 * into a shape their own schema does not describe.
 */
export function scopeFromQueryKey(queryKey: QueryKey): ThreadListScope | null {
  const json = toJsonQueryKey(queryKey);
  if (json === null) return null;

  const parsed = threadListKeySchema.safeParse(json);
  if (!parsed.success) return null;

  const [, view, pinned] = parsed.data;
  return pinned === "all" ? { view } : { view, pinned };
}

export type ThreadListSnapshot = ReadonlyArray<readonly [QueryKey, ThreadListPages | undefined]>;

export type ThreadListCache = {
  /** Every cached list, for rollback when the server refuses the change. */
  readonly snapshot: () => ThreadListSnapshot;
  readonly restore: (snapshot: ThreadListSnapshot) => void;
  /**
   * Applies a change to one thread everywhere it is cached, moving it between
   * lists as the change requires. Returns the thread as it was, so a caller
   * can tell whether anything was actually there to change.
   */
  readonly patchThread: (
    threadId: string,
    patch: Partial<Pick<ThreadDto, "title" | "pinned" | "archived" | "updatedAt">>,
  ) => ThreadDto | null;
  readonly insertThread: (thread: ThreadDto) => void;
  readonly removeThread: (threadId: string) => void;
};

function eachList(
  client: QueryClient,
  visit: (params: {
    queryKey: QueryKey;
    pages: ThreadListPages;
    scope: ThreadListScope;
  }) => ThreadListPages,
): void {
  for (const [queryKey, pages] of client.getQueriesData<ThreadListPages>({
    queryKey: THREADS_QUERY_KEY,
  })) {
    if (pages === undefined) continue;
    const scope = scopeFromQueryKey(queryKey);
    if (scope === null) continue;

    client.setQueryData<ThreadListPages>(queryKey, visit({ queryKey, pages, scope }));
  }
}

/** The thread as any cached list currently has it. */
function currentThread(client: QueryClient, threadId: string): ThreadDto | null {
  for (const [, pages] of client.getQueriesData<ThreadListPages>({
    queryKey: THREADS_QUERY_KEY,
  })) {
    const found = findThread(pages, threadId);
    if (found !== null) return found;
  }
  return null;
}

export function useThreadListCache(): ThreadListCache {
  const client = useQueryClient();

  return useMemo<ThreadListCache>(
    () => ({
      snapshot: () => client.getQueriesData<ThreadListPages>({ queryKey: THREADS_QUERY_KEY }),

      restore: (snapshot) => {
        for (const [queryKey, pages] of snapshot) {
          client.setQueryData<ThreadListPages>(queryKey, pages);
        }
      },

      patchThread: (threadId, patch) => {
        const before = currentThread(client, threadId);
        if (before === null) return null;

        const updated: ThreadDto = { ...before, ...patch };
        eachList(client, ({ pages, scope }) =>
          belongsInScope(updated, scope)
            ? insertThreadIntoPages(pages, { thread: updated, scope })
            : removeThreadFromPages(pages, threadId),
        );
        return before;
      },

      insertThread: (thread) => {
        eachList(client, ({ pages, scope }) => insertThreadIntoPages(pages, { thread, scope }));
      },

      removeThread: (threadId) => {
        eachList(client, ({ pages }) => removeThreadFromPages(pages, threadId));
      },
    }),
    [client],
  );
}
