/**
 * The cache is not a trusted store (constraint C1).
 *
 * Phase L gives React Query a disk, and a disk is an external payload like any
 * other: the last deploy wrote it, this one may disagree about its shape, and
 * a browser profile can be years old. These tests pin down the two properties
 * that make that safe — a record is **parsed** into a named type before it
 * reaches the cache, and a record that no longer parses costs one entry rather
 * than everybody's whole cache.
 *
 * They also pin down what is persisted at all. Search results are keyed by
 * whatever anyone typed, and letting them into the store would be a slow leak
 * with a user's search history in it.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import type { CacheRecord } from "@/lib/cache/indexed-db";
import { kindForQueryKey, toJsonQueryKey } from "@/lib/cache/query-persistence";
import {
  threadMessagesQueryKey,
  threadSearchQueryKey,
  threadsQueryKey,
  memoryConsentQueryKey,
} from "@/lib/query-keys";

function record(overrides: Partial<CacheRecord> & Pick<CacheRecord, "queryKey" | "payload">) {
  return {
    id: "user-1::key",
    userId: "user-1",
    updatedAt: Date.UTC(2026, 8, 21),
    ...overrides,
  };
}

test("the sidebar's thread lists are persisted", () => {
  const key = toJsonQueryKey(threadsQueryKey("active"));

  assert.notEqual(key, null);
  assert.equal(key !== null && kindForQueryKey(key)?.id, "threads");
});

test("a thread's transcript is persisted", () => {
  const key = toJsonQueryKey(threadMessagesQueryKey("thread-1"));

  assert.equal(key !== null && kindForQueryKey(key)?.id, "thread_messages");
});

test("search results are not persisted, despite sharing the thread prefix", () => {
  const key = toJsonQueryKey(threadSearchQueryKey("invoice"));

  assert.equal(key !== null && kindForQueryKey(key), null);
});

test("authorisation state is not persisted", () => {
  const key = toJsonQueryKey(memoryConsentQueryKey());

  assert.equal(key !== null && kindForQueryKey(key), null);
});

test("a well-formed record is parsed into the cache", () => {
  const client = new QueryClient();
  const queryKey = toJsonQueryKey(threadMessagesQueryKey("thread-1"));
  assert.notEqual(queryKey, null);
  if (queryKey === null) return;

  const kind = kindForQueryKey(queryKey);
  assert.notEqual(kind, null);

  const hydrated = kind?.hydrate({
    client,
    record: record({
      queryKey,
      payload: {
        messages: [
          {
            id: "message-1",
            threadId: "thread-1",
            role: "user",
            parts: [{ type: "text", text: "hello" }],
            modelId: null,
            inputTokens: 0,
            outputTokens: 0,
            createdAt: "2026-09-21T09:00:00.000Z",
          },
        ],
        nextCursor: null,
      },
    }),
  });

  assert.equal(hydrated, true);
  assert.notEqual(client.getQueryData(threadMessagesQueryKey("thread-1")), undefined);
});

test("a record whose shape no longer matches is refused, and nothing reaches the cache", () => {
  const client = new QueryClient();
  const queryKey = toJsonQueryKey(threadMessagesQueryKey("thread-1"));
  if (queryKey === null) {
    assert.fail("thread message keys are JSON");
    return;
  }

  // What a previous deploy might plausibly have written: the right key, a
  // payload this version cannot read.
  const hydrated = kindForQueryKey(queryKey)?.hydrate({
    client,
    record: record({ queryKey, payload: { messages: "not an array", nextCursor: null } }),
  });

  assert.equal(hydrated, false);
  assert.equal(client.getQueryData(threadMessagesQueryKey("thread-1")), undefined);
});

test("hydration never overwrites data the app has already loaded", () => {
  const client = new QueryClient();
  const live = { messages: [], nextCursor: null };
  client.setQueryData(threadMessagesQueryKey("thread-1"), live);

  const queryKey = toJsonQueryKey(threadMessagesQueryKey("thread-1"));
  if (queryKey === null) {
    assert.fail("thread message keys are JSON");
    return;
  }

  const hydrated = kindForQueryKey(queryKey)?.hydrate({
    client,
    record: record({ queryKey, payload: { messages: [], nextCursor: "stale-cursor" } }),
  });

  assert.equal(hydrated, false);
  assert.equal(client.getQueryData(threadMessagesQueryKey("thread-1")), live);
});
