/**
 * The cached sidebar, as data rather than as a component.
 *
 * Phase L item 3 asks every sidebar mutation — rename, pin, archive, delete,
 * new thread — to apply locally and reconcile, instead of invalidating the
 * list and waiting for a refetch to say what the client already knew. That
 * turns each mutation into a small, total function over the cached pages, and
 * those functions are here: pure, free of React, and therefore testable
 * without rendering anything.
 *
 * Two rules hold throughout:
 *
 *  - **The order matches the server's.** `listThreads` orders by
 *    `(updated_at desc, id desc)`, so an optimistic insert or a change that
 *    touches `updatedAt` has to re-sort by the same key. A list that
 *    reorders itself when the refetch lands is worse than one that never
 *    moved.
 *  - **Membership is re-decided, not assumed.** Archiving a thread removes it
 *    from the active list and adds it to the archived one; pinning moves it
 *    between the pinned and unpinned variants. Each cached list knows which
 *    threads belong in it, so one patch can be applied to every variant and
 *    each will do the right thing with it.
 */

import type { ThreadDto, ThreadListResponse, ThreadView } from "@/lib/api/contracts";
import type { ThreadListPages } from "@/lib/cache/query-persistence";

/** Which cached list a set of pages represents. Mirrors `threadsQueryKey`. */
export type ThreadListScope = {
  readonly view: ThreadView;
  /** Undefined for the list that shows pinned and unpinned together. */
  readonly pinned?: boolean | undefined;
};

/** Whether a thread belongs in the list described by `scope`. */
export function belongsInScope(thread: ThreadDto, scope: ThreadListScope): boolean {
  const matchesView = scope.view === "archived" ? thread.archived : !thread.archived;
  if (!matchesView) return false;
  return scope.pinned === undefined || thread.pinned === scope.pinned;
}

/** `(updated_at desc, id desc)`, the same comparison the repository paginates on. */
export function compareThreads(left: ThreadDto, right: ThreadDto): number {
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt < right.updatedAt ? 1 : -1;
  }
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}

/** The thread with this id, from anywhere in the cached pages. */
export function findThread(pages: ThreadListPages | undefined, threadId: string): ThreadDto | null {
  if (pages === undefined) return null;

  for (const page of pages.pages) {
    const found = page.threads.find((thread) => thread.id === threadId);
    if (found !== undefined) return found;
  }
  return null;
}

/**
 * Rewrites the pages with `next`, dropping anything that no longer belongs.
 *
 * Kept as one helper because every operation below is the same shape: take the
 * flat list, change it, put it back. Pagination is preserved by rebuilding the
 * pages at their original sizes — a cursor points at a position in the
 * server's ordering, and rewriting one page's contents does not move it.
 */
function rewrite(pages: ThreadListPages, next: readonly ThreadDto[]): ThreadListPages {
  const sizes = pages.pages.map((page) => page.threads.length);
  const rebuilt: ThreadListResponse[] = [];

  let offset = 0;
  for (const [index, page] of pages.pages.entries()) {
    // The last page absorbs the difference, so an optimistic insert is visible
    // immediately rather than being pushed past the end of the pages we hold.
    const isLast = index === pages.pages.length - 1;
    const size = sizes[index] ?? 0;
    const slice = isLast ? next.slice(offset) : next.slice(offset, offset + size);
    offset += slice.length;
    rebuilt.push({ threads: slice, nextCursor: page.nextCursor });
  }

  return { pages: rebuilt, pageParams: pages.pageParams };
}

/** Every thread across the cached pages, in order. */
function flatten(pages: ThreadListPages): ThreadDto[] {
  return pages.pages.flatMap((page) => page.threads);
}

/**
 * Applies a patch to one thread in one cached list.
 *
 * The patched thread is removed when it no longer belongs in this list — the
 * archive that just left the active view, the unpin that left the pinned one —
 * and re-sorted when it is still a member, because a patch that bumps
 * `updatedAt` moves it to the top.
 */
export function patchThreadInPages(
  pages: ThreadListPages,
  params: {
    readonly threadId: string;
    readonly patch: Partial<Pick<ThreadDto, "title" | "pinned" | "archived" | "updatedAt">>;
    readonly scope: ThreadListScope;
  },
): ThreadListPages {
  const current = flatten(pages);
  if (!current.some((thread) => thread.id === params.threadId)) return pages;

  const next: ThreadDto[] = [];
  for (const thread of current) {
    if (thread.id !== params.threadId) {
      next.push(thread);
      continue;
    }
    const patched: ThreadDto = { ...thread, ...params.patch };
    if (belongsInScope(patched, params.scope)) next.push(patched);
  }

  return rewrite(pages, next.sort(compareThreads));
}

/** Removes a thread from one cached list. */
export function removeThreadFromPages(pages: ThreadListPages, threadId: string): ThreadListPages {
  const current = flatten(pages);
  const next = current.filter((thread) => thread.id !== threadId);
  return next.length === current.length ? pages : rewrite(pages, next);
}

/**
 * Inserts a thread into one cached list, if it belongs there.
 *
 * Used both for a thread created locally and for one arriving from another
 * list — archiving moves a row from the active pages to the archived ones, and
 * the archived list should show it without a refetch.
 */
export function insertThreadIntoPages(
  pages: ThreadListPages,
  params: { readonly thread: ThreadDto; readonly scope: ThreadListScope },
): ThreadListPages {
  if (!belongsInScope(params.thread, params.scope)) return pages;

  const current = flatten(pages).filter((thread) => thread.id !== params.thread.id);
  current.push(params.thread);
  return rewrite(pages, current.sort(compareThreads));
}
