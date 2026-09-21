"use client";

/**
 * The persisted client cache (Phase L item 1).
 *
 * React Query's cache lives in memory and dies with the tab. This module gives
 * it a disk: the thread list and every transcript the user has opened are
 * written to IndexedDB as they change, and read back into the cache when the
 * app boots. A revisited thread then renders from disk and revalidates behind
 * the render, which is the whole of what "feels local" means here.
 *
 * ## What is persisted, and what is not
 *
 * Only what is named in {@link PERSISTED_KINDS}: the sidebar's thread pages and
 * the transcripts. Search results are not — they are keyed by a query string,
 * so persisting them would fill the store with one entry per thing anyone ever
 * typed. Subscription and consent are not — both are authorisation state, and
 * serving those from disk is how a cancelled plan keeps working offline.
 *
 * ## The cache is not a trusted store
 *
 * Every record is parsed on read into a named type before it reaches the query
 * cache (constraint C1). This is not defensive decoration: the last deploy
 * wrote these bytes and this one may disagree about their shape, and a browser
 * profile can be years old. A record that no longer parses is dropped, one
 * record at a time — never the whole cache, which would punish every user for
 * one renamed field.
 *
 * ## Why there is no loading gate
 *
 * Hydration is asynchronous, so a query could in principle mount and fetch
 * before its cached data arrives. That race is only reachable on the first
 * render after a full page load — which is the cold path, and has a budget of
 * its own. Every thread switch after boot reads a cache that is already in
 * memory. Blocking the tree on an IndexedDB read to close a race that only
 * happens when the user is loading the app anyway would trade the measured
 * budget for the unmeasured one.
 */

import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  cacheRecordId,
  clearCacheStore,
  deleteCacheRecords,
  readCacheRecords,
  writeCacheRecord,
  type CacheRecord,
} from "@/lib/cache/indexed-db";
import {
  messageListResponseSchema,
  threadListResponseSchema,
  type MessageListResponse,
  type ThreadListResponse,
} from "@/lib/api/contracts";
import { jsonValueSchema, toJsonValue, type JsonValue } from "@/lib/json";
import { THREAD_MESSAGES_QUERY_KEY, THREADS_QUERY_KEY } from "@/lib/query-keys";

/**
 * How long a record is honoured.
 *
 * A week, because the value of the cache is "the threads I have been working
 * in", and a transcript nobody has opened in a week is one the round trip can
 * be afforded for. Expired records are deleted at hydration rather than swept
 * on a timer: boot is the only moment the whole store is being read anyway.
 */
const RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How many records one user keeps.
 *
 * The store holds pages, not an unbounded blob — a transcript is capped by its
 * own pagination — but a user who opens two hundred conversations should not
 * accumulate two hundred entries. Eviction is oldest-first, which for this
 * cache is also least-recently-visited.
 */
const MAX_RECORDS_PER_USER = 80;

/**
 * How long writes are coalesced.
 *
 * An optimistic rename touches three cached list variants in the same tick,
 * and a settled turn invalidates all of them. Writing on each would be three
 * transactions for one user action; a short window makes it one.
 */
const WRITE_DEBOUNCE_MS = 400;

/** Cursors, as every paginated query in this app parameterises its pages. */
const pageParamsSchema = z.array(z.string().optional());

/** The sidebar's thread pages, exactly as `useInfiniteQuery` holds them. */
export type ThreadListPages = InfiniteData<ThreadListResponse, string | undefined>;

const threadListPagesSchema = z.object({
  pages: z.array(threadListResponseSchema),
  pageParams: pageParamsSchema,
});

/**
 * A transcript's newest window — the one page a thread switch has to have.
 *
 * Only the first page is persisted. "Load earlier messages" is a deliberate
 * action with a control and a spinner of its own; it has never been something
 * a user expects to be instant, and storing every page anyone has ever scrolled
 * back through would grow the cache without improving a single budget.
 */
export type MessageWindow = MessageListResponse;

const queryKeySchema = z.array(jsonValueSchema).min(1);

type PersistedKind = {
  readonly id: string;
  /** Whether this kind owns a query key. Checked against the *stored* key. */
  readonly matches: (queryKey: readonly JsonValue[]) => boolean;
  /**
   * Puts one record back into the cache, or reports that it could not.
   *
   * Each kind carries its own parse and its own `setQueryData` call rather
   * than returning a value through a shared union, so the data type stays
   * exact at both ends — there is no point in the pipeline where a transcript
   * and a thread list are the same type.
   */
  readonly hydrate: (params: { client: QueryClient; record: CacheRecord }) => boolean;
};

const [THREADS_ROOT] = THREADS_QUERY_KEY;
const [MESSAGES_ROOT] = THREAD_MESSAGES_QUERY_KEY;

const PERSISTED_KINDS: readonly PersistedKind[] = [
  {
    id: "threads",
    // `["threads", view, pinned]` but not `["threads", "search", q]`.
    matches: (queryKey) => queryKey[0] === THREADS_ROOT && queryKey[1] !== "search",
    hydrate: ({ client, record }) => {
      const parsed = threadListPagesSchema.safeParse(record.payload);
      if (!parsed.success) return false;
      if (client.getQueryData(record.queryKey) !== undefined) return false;

      client.setQueryData<ThreadListPages>(record.queryKey, parsed.data, {
        updatedAt: record.updatedAt,
      });
      return true;
    },
  },
  {
    id: "thread_messages",
    matches: (queryKey) => queryKey[0] === MESSAGES_ROOT,
    hydrate: ({ client, record }) => {
      const parsed = messageListResponseSchema.safeParse(record.payload);
      if (!parsed.success) return false;
      if (client.getQueryData(record.queryKey) !== undefined) return false;

      client.setQueryData<MessageWindow>(record.queryKey, parsed.data, {
        updatedAt: record.updatedAt,
      });
      return true;
    },
  },
];

/** The kind that owns a query key, or null when nothing persists it. */
export function kindForQueryKey(queryKey: readonly JsonValue[]): PersistedKind | null {
  return PERSISTED_KINDS.find((kind) => kind.matches(queryKey)) ?? null;
}

/**
 * Reads a query key that arrived as `readonly unknown[]` — which is what React
 * Query's `QueryKey` is — into the JSON array this module can reason about.
 *
 * Null for a key carrying something JSON cannot represent. Nothing in this app
 * builds one, and a key that cannot be serialized cannot be persisted anyway.
 */
export function toJsonQueryKey(queryKey: unknown): JsonValue[] | null {
  const json = toJsonValue(queryKey);
  if (json === null) return null;

  const parsed = queryKeySchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * Loads this user's cache from disk into `client`.
 *
 * Reads only this user's records — the store is indexed by user id, and a
 * record written under another account is never a candidate to hydrate.
 * Removing the other account's rows is `endLocalSession`'s job, which runs
 * where signing out happens, because that is the moment a shared browser
 * should stop holding the previous user's conversation titles.
 */
export async function hydratePersistedQueries(params: {
  readonly client: QueryClient;
  readonly userId: string;
  readonly now?: Date;
}): Promise<number> {
  const nowMs = (params.now ?? new Date()).getTime();
  const records = await readCacheRecords(params.userId);

  const expired: string[] = [];
  const live: CacheRecord[] = [];

  for (const record of records) {
    if (nowMs - record.updatedAt > RECORD_TTL_MS) {
      expired.push(record.id);
      continue;
    }
    live.push(record);
  }

  // Newest first, so the eviction below drops the least recently useful.
  live.sort((left, right) => right.updatedAt - left.updatedAt);
  const kept = live.slice(0, MAX_RECORDS_PER_USER);
  for (const record of live.slice(MAX_RECORDS_PER_USER)) expired.push(record.id);

  let hydrated = 0;
  for (const record of kept) {
    const kind = kindForQueryKey(record.queryKey);
    if (kind === null) {
      // Written by a deploy that persisted something this one does not.
      expired.push(record.id);
      continue;
    }
    if (kind.hydrate({ client: params.client, record })) hydrated += 1;
  }

  if (expired.length > 0) await deleteCacheRecords(expired);
  return hydrated;
}

/**
 * Mirrors successful query results to disk for as long as the returned
 * function is not called.
 *
 * Subscribed to the cache rather than wired into each query, so a query added
 * in a later phase is persisted by naming it in {@link PERSISTED_KINDS} and
 * nowhere else (constraint C8).
 */
export function persistQueryCache(params: {
  readonly client: QueryClient;
  readonly userId: string;
}): () => void {
  const pending = new Map<string, CacheRecord>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const batch = [...pending.values()];
    pending.clear();
    for (const record of batch) void writeCacheRecord(record);
  };

  const schedule = (record: CacheRecord) => {
    pending.set(record.id, record);
    if (timer !== null) return;
    timer = setTimeout(flush, WRITE_DEBOUNCE_MS);
  };

  const unsubscribe = params.client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;

    const queryKey = toJsonQueryKey(event.query.queryKey);
    if (queryKey === null || kindForQueryKey(queryKey) === null) return;

    const payload = toJsonValue(event.query.state.data);
    if (payload === null) return;

    schedule({
      id: cacheRecordId(params.userId, queryKey),
      userId: params.userId,
      queryKey,
      updatedAt: Date.now(),
      payload,
    });
  });

  return () => {
    unsubscribe();
    if (timer === null) return;
    clearTimeout(timer);
    // Flush rather than discard: the unsubscribe happens on unmount, and the
    // writes in flight at that moment are the most recent state there is.
    flush();
  };
}

/**
 * Forgets everything this device holds for the session that is ending.
 *
 * Called from the places a user signs out, rather than inferred from an auth
 * state change in a provider — leaving a device clean is part of signing out,
 * not a side effect of one, and a component that unmounts as the redirect
 * happens is not a reliable place to put it.
 *
 * The whole store is emptied, not just this account's rows. There is nothing
 * in here worth preserving across an account switch, and a shared machine
 * should not keep a readable transcript of the previous session in
 * `chrome://indexeddb-internals`.
 */
export async function endLocalSession(client: QueryClient): Promise<void> {
  client.clear();
  await clearCacheStore();
}
