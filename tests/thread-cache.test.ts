/**
 * The optimistic sidebar, as arithmetic.
 *
 * Phase L item 3 replaced "mutate, invalidate, wait for a refetch" with
 * "mutate the cache, send the request, reconcile". That moves a decision the
 * server used to make — which list a thread belongs in, and where in it — onto
 * the client, so these tests exist to keep the client's answer the same as the
 * server's. The two facts they pin down are the ones a refetch would otherwise
 * have corrected for free: **membership** (archiving removes a row from the
 * active list and adds it to the archived one) and **ordering**
 * (`updated_at desc, id desc`, exactly as `listThreads` paginates).
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { ThreadDto } from "@/lib/api/contracts";
import type { ThreadListPages } from "@/lib/cache/query-persistence";
import {
  belongsInScope,
  compareThreads,
  findThread,
  insertThreadIntoPages,
  patchThreadInPages,
  removeThreadFromPages,
} from "@/lib/threads/thread-cache";

function thread(overrides: Partial<ThreadDto> & Pick<ThreadDto, "id">): ThreadDto {
  return {
    title: `Thread ${overrides.id}`,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    lastMessageAt: null,
    archived: false,
    pinned: false,
    ...overrides,
  };
}

function pagesOf(...pages: ThreadDto[][]): ThreadListPages {
  return {
    pages: pages.map((threads, index) => ({
      threads,
      nextCursor: index === pages.length - 1 ? null : `cursor-${String(index)}`,
    })),
    pageParams: pages.map((_page, index) => (index === 0 ? undefined : `cursor-${String(index)}`)),
  };
}

const active = { view: "active" } as const;

test("a thread belongs to the list whose view and pinned state it matches", () => {
  const pinnedThread = thread({ id: "a", pinned: true });

  assert.equal(belongsInScope(pinnedThread, { view: "active" }), true);
  assert.equal(belongsInScope(pinnedThread, { view: "active", pinned: true }), true);
  assert.equal(belongsInScope(pinnedThread, { view: "active", pinned: false }), false);
  assert.equal(belongsInScope(pinnedThread, { view: "archived" }), false);
});

test("threads order by updated_at descending, with the id breaking ties", () => {
  const older = thread({ id: "z", updatedAt: "2026-09-01T00:00:00.000Z" });
  const newer = thread({ id: "a", updatedAt: "2026-09-02T00:00:00.000Z" });
  const sameMoment = thread({ id: "b", updatedAt: "2026-09-02T00:00:00.000Z" });

  const sorted = [older, sameMoment, newer].sort(compareThreads);

  // `updated_at desc, id desc` — so "b" precedes "a" at the same timestamp.
  assert.deepEqual(
    sorted.map((item) => item.id),
    ["b", "a", "z"],
  );
});

test("renaming keeps the thread in place and shows the new title at once", () => {
  const pages = pagesOf([thread({ id: "a" }), thread({ id: "b" })]);

  const next = patchThreadInPages(pages, {
    threadId: "b",
    patch: { title: "Renamed" },
    scope: active,
  });

  assert.equal(findThread(next, "b")?.title, "Renamed");
  assert.equal(findThread(next, "a")?.title, "Thread a");
});

test("a patch that bumps updated_at moves the row to the top, as the refetch would", () => {
  const pages = pagesOf([
    thread({ id: "a", updatedAt: "2026-09-03T00:00:00.000Z" }),
    thread({ id: "b", updatedAt: "2026-09-02T00:00:00.000Z" }),
  ]);

  const next = patchThreadInPages(pages, {
    threadId: "b",
    patch: { title: "Renamed", updatedAt: "2026-09-04T00:00:00.000Z" },
    scope: active,
  });

  assert.deepEqual(
    next.pages.flatMap((page) => page.threads).map((item) => item.id),
    ["b", "a"],
  );
});

test("archiving removes the thread from the active list", () => {
  const pages = pagesOf([thread({ id: "a" }), thread({ id: "b" })]);

  const next = patchThreadInPages(pages, {
    threadId: "a",
    patch: { archived: true },
    scope: active,
  });

  assert.equal(findThread(next, "a"), null);
  assert.equal(findThread(next, "b")?.id, "b");
});

test("the same archive inserts the thread into the archived list", () => {
  const archivedPages = pagesOf([thread({ id: "old", archived: true })]);

  const next = insertThreadIntoPages(archivedPages, {
    thread: thread({ id: "a", archived: true, updatedAt: "2026-09-05T00:00:00.000Z" }),
    scope: { view: "archived" },
  });

  assert.deepEqual(
    next.pages.flatMap((page) => page.threads).map((item) => item.id),
    ["a", "old"],
  );
});

test("inserting a thread into a list it does not belong to changes nothing", () => {
  const pages = pagesOf([thread({ id: "a" })]);

  const next = insertThreadIntoPages(pages, {
    thread: thread({ id: "b", archived: true }),
    scope: active,
  });

  assert.equal(next, pages);
});

test("an insert replaces rather than duplicates a thread already cached", () => {
  const pages = pagesOf([thread({ id: "a", title: "Old" })]);

  const next = insertThreadIntoPages(pages, {
    thread: thread({ id: "a", title: "New" }),
    scope: active,
  });

  const all = next.pages.flatMap((page) => page.threads);
  assert.equal(all.length, 1);
  assert.equal(all[0]?.title, "New");
});

test("deleting removes the row and leaves the cursors alone", () => {
  const pages = pagesOf([thread({ id: "a" }), thread({ id: "b" })], [thread({ id: "c" })]);

  const next = removeThreadFromPages(pages, "b");

  assert.equal(findThread(next, "b"), null);
  assert.deepEqual(
    next.pages.map((page) => page.nextCursor),
    pages.pages.map((page) => page.nextCursor),
  );
  assert.deepEqual(next.pageParams, pages.pageParams);
});

test("a patch for a thread that is not cached is a no-op, not an insert", () => {
  const pages = pagesOf([thread({ id: "a" })]);

  const next = patchThreadInPages(pages, {
    threadId: "missing",
    patch: { title: "Nope" },
    scope: active,
  });

  assert.equal(next, pages);
});

test("pagination survives an edit: rows stay in their pages and the last one absorbs growth", () => {
  const pages = pagesOf(
    [thread({ id: "a" }), thread({ id: "b" })],
    [thread({ id: "c" }), thread({ id: "d" })],
  );

  const next = insertThreadIntoPages(pages, {
    thread: thread({ id: "e", updatedAt: "2026-08-01T00:00:00.000Z" }),
    scope: active,
  });

  assert.equal(next.pages[0]?.threads.length, 2);
  assert.equal(next.pages[1]?.threads.length, 3);
  assert.equal(next.pages[1]?.threads.at(-1)?.id, "e");
});
