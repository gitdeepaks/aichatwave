/**
 * LangGraph vector store for long-term memory.
 *
 * The store's DDL used to run here on first use (`store.setup()` behind a
 * module-level flag), which put schema creation on the request path. Setup now
 * happens in `scripts/db-setup-langgraph.ts` as part of `pnpm migration:migrate`,
 * so this module only opens the connection.
 */

import { OpenAIEmbeddings } from "@langchain/openai";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { MEMORY_EMBEDDING_DIMENSIONS, MEMORY_EMBEDDING_MODEL } from "@/lib/ai/memory-config";
import { pgConnectionStringWithExplicitVerifyFull } from "@/lib/pg-connection-string";
import { env } from "@/lib/env";

const store = PostgresStore.fromConnString(
  pgConnectionStringWithExplicitVerifyFull(env.DATABASE_URL),
  {
    index: {
      dims: MEMORY_EMBEDDING_DIMENSIONS,
      embed: new OpenAIEmbeddings({
        model: MEMORY_EMBEDDING_MODEL,
        apiKey: env.OPENAI_API_KEY,
      }),
    },
  },
);

export function getStore(): PostgresStore {
  return store;
}
