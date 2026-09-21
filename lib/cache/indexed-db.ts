"use client";

/**
 * The disk behind the client cache.
 *
 * A thin, typed wrapper over IndexedDB: one database, one object store, one
 * index. No dependency, because the surface actually used here is four
 * operations wide and a library would be more code than the wrapper.
 *
 * Two things are deliberate:
 *
 *  - **Nothing here ever rejects.** IndexedDB is absent in a server render,
 *    blocked in some private-browsing modes, and can fail mid-transaction when
 *    a user clears site data. A cache that can throw is a cache that can take
 *    the app down, so every operation resolves to a value that says "no" —
 *    `null`, `[]`, `false` — and the caller carries on to the network.
 *  - **Nothing here trusts what it reads.** Values come back as `any` from the
 *    DOM types, and they were written by whatever version of this app was
 *    deployed last. They are parsed into {@link CacheRecord} before anything
 *    else sees them, exactly as an HTTP payload is (constraint C1).
 */

import { z } from "zod";
import { jsonValueSchema, toJsonValue, type JsonValue } from "@/lib/json";

const DATABASE_NAME = "aichatwave-cache";

/**
 * Bumped when the *store layout* changes — a new index, a renamed store.
 *
 * Not bumped when a cached payload's shape changes: that is what parsing on
 * read is for, and a shape mismatch drops one record rather than everyone's
 * whole cache.
 */
const DATABASE_VERSION = 1;

const STORE_NAME = "query_cache";
const USER_INDEX = "by_user";

/**
 * One cached query.
 *
 * `queryKey` is stored alongside the payload rather than derived from the
 * primary key: the primary key is a string because IndexedDB wants one, and
 * reconstructing an array key by parsing that string back would be a second
 * encoding to keep in step with the first.
 */
export const cacheRecordSchema = z.object({
  /** Primary key: the serialized query key, scoped to the user. */
  id: z.string().min(1),
  userId: z.string().min(1),
  queryKey: z.array(jsonValueSchema),
  /** Epoch milliseconds, so React Query can be told how old the data is. */
  updatedAt: z.number().int().nonnegative(),
  payload: jsonValueSchema,
});
export type CacheRecord = z.infer<typeof cacheRecordSchema>;

const cacheRecordsSchema = z.array(cacheRecordSchema);

/** Parses whatever an `IDBRequest` produced, dropping anything unrecognisable. */
function toCacheRecords(value: unknown): CacheRecord[] {
  const json = toJsonValue(value);
  if (json === null) return [];

  const parsed = cacheRecordsSchema.safeParse(json);
  if (parsed.success) return parsed.data;

  // A partially-readable batch is still worth having: one record written by a
  // previous deploy should not discard the rest of the cache.
  const array = z.array(jsonValueSchema).safeParse(json);
  if (!array.success) return [];

  const records: CacheRecord[] = [];
  for (const item of array.data) {
    const record = cacheRecordSchema.safeParse(item);
    if (record.success) records.push(record.data);
  }
  return records;
}

/**
 * The open database for this tab, opened at most once.
 *
 * Held as the promise rather than the result so that two callers racing at
 * boot share one `open` request instead of opening the database twice — the
 * second of which would be blocked by the first's upgrade transaction.
 */
let connection: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (connection !== null) return connection;

  connection = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    } catch {
      // Throws synchronously when storage is blocked outright.
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;
      if (database.objectStoreNames.contains(STORE_NAME)) return;

      const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
      // Every read is "this user's cache", and every sign-in has to be able to
      // delete the previous user's. Both are one index away; neither is a scan.
      store.createIndex(USER_INDEX, "userId", { unique: false });
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      resolve(null);
    };
    request.onblocked = () => {
      resolve(null);
    };
  });

  return connection;
}

type TransactionMode = "readonly" | "readwrite";

/**
 * Runs one transaction against the store, resolving to `fallback` on any
 * failure — including the ones that surface as an event rather than a throw.
 */
async function withStore<TResult>(
  mode: TransactionMode,
  fallback: TResult,
  work: (store: IDBObjectStore, done: (result: TResult) => void) => void,
): Promise<TResult> {
  const database = await openDatabase();
  if (database === null) return fallback;

  return new Promise<TResult>((resolve) => {
    let settled = false;
    const settle = (result: TResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const transaction = database.transaction(STORE_NAME, mode);
      transaction.onerror = () => {
        settle(fallback);
      };
      transaction.onabort = () => {
        settle(fallback);
      };
      work(transaction.objectStore(STORE_NAME), settle);
    } catch {
      settle(fallback);
    }
  });
}

/** Every record this user has cached in this browser. */
export function readCacheRecords(userId: string): Promise<CacheRecord[]> {
  return withStore<CacheRecord[]>("readonly", [], (store, done) => {
    const request = store.index(USER_INDEX).getAll(userId);
    request.onsuccess = () => {
      done(toCacheRecords(request.result));
    };
    request.onerror = () => {
      done([]);
    };
  });
}

/** Writes one record, replacing any previous version of the same query. */
export function writeCacheRecord(record: CacheRecord): Promise<boolean> {
  return withStore<boolean>("readwrite", false, (store, done) => {
    const request = store.put(record);
    request.onsuccess = () => {
      done(true);
    };
    request.onerror = () => {
      done(false);
    };
  });
}

/** Removes records this user's cache should no longer hold. */
export function deleteCacheRecords(ids: readonly string[]): Promise<boolean> {
  if (ids.length === 0) return Promise.resolve(true);

  return withStore<boolean>("readwrite", false, (store, done) => {
    for (const id of ids) store.delete(id);
    // One `complete` covers every delete in the transaction, which is why the
    // individual requests are not awaited.
    store.transaction.oncomplete = () => {
      done(true);
    };
  });
}

/**
 * Empties the store.
 *
 * Used on sign-out. Deliberately not "delete this user's rows": a shared
 * machine should not keep a readable transcript of the previous session in
 * `chrome://indexeddb-internals`, and there is nothing in here worth
 * preserving across an account switch.
 */
export function clearCacheStore(): Promise<boolean> {
  return withStore<boolean>("readwrite", false, (store, done) => {
    const request = store.clear();
    request.onsuccess = () => {
      done(true);
    };
    request.onerror = () => {
      done(false);
    };
  });
}

/** The primary key for a query key, scoped so two accounts cannot collide. */
export function cacheRecordId(userId: string, queryKey: readonly JsonValue[]): string {
  return `${userId}::${JSON.stringify(queryKey)}`;
}
