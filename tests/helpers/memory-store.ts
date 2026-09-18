/**
 * The real LangGraph vector store, on the test database, with a fake embedder.
 *
 * Memory is the one place where "stub the edge, run everything else" needs
 * saying out loud. The store, its pgvector tables, the namespace layout, the
 * `put`/`search`/`get`/`delete` calls and `memory-service`'s parsing all run
 * for real; only the OpenAI embedding call is replaced, because an embedding
 * is a network round trip that costs money and returns a different vector every
 * model revision.
 *
 * The replacement is deterministic and content-derived, so two different texts
 * get two different vectors and the same text always gets the same one. That is
 * enough for the ordering and isolation properties these tests assert; it is
 * explicitly not enough to assert anything about semantic ranking, and no test
 * here does.
 */

import { createHash } from "node:crypto";
import { Embeddings } from "@langchain/core/embeddings";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { MEMORY_EMBEDDING_DIMENSIONS } from "@/lib/ai/memory-config";
import { testDatabaseUrl } from "./environment";
import { stubModule } from "./module-stub";

/** A stable pseudo-random unit vector derived from the text itself. */
class DeterministicEmbeddings extends Embeddings {
  constructor() {
    super({});
  }

  override embedDocuments(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((text) => vectorFor(text)));
  }

  override embedQuery(text: string): Promise<number[]> {
    return Promise.resolve(vectorFor(text));
  }
}

function vectorFor(text: string): number[] {
  const digest = createHash("sha256").update(text).digest();
  const vector: number[] = [];

  for (let index = 0; index < MEMORY_EMBEDDING_DIMENSIONS; index += 1) {
    const byte = digest[index % digest.length] ?? 0;
    vector.push((byte - 128) / 128);
  }

  const norm = Math.sqrt(vector.reduce((total, value) => total + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

let store: PostgresStore | null = null;

/**
 * Creates the store's tables and points `@/server/memory/store` at it.
 *
 * Call from a `before` hook, after the database exists. Needs pgvector, which
 * the `pgvector/pgvector` image in `docker-compose.yaml` and the CI service
 * container both provide.
 */
export async function setupMemoryStore(): Promise<void> {
  const created = PostgresStore.fromConnString(testDatabaseUrl, {
    index: { dims: MEMORY_EMBEDDING_DIMENSIONS, embed: new DeterministicEmbeddings() },
  });

  await created.setup();
  store = created;

  stubModule("@/server/memory/store", { getStore: () => created });
}

export async function teardownMemoryStore(): Promise<void> {
  if (store === null) return;
  await store.stop();
  store = null;
}
