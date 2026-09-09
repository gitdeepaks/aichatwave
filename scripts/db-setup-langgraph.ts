/**
 * Creates the LangGraph checkpoint and vector-store tables.
 *
 * This DDL used to run at module-import time in `server/chat/agent.ts`, which
 * meant every cold start paid for it. It belongs in the migration step, so it
 * lives here and runs as part of `pnpm migration:migrate`.
 */

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MEMORY_EMBEDDING_DIMENSIONS, MEMORY_EMBEDDING_MODEL } from "@/lib/ai/memory-config";
import { pgConnectionStringWithExplicitVerifyFull } from "@/lib/pg-connection-string";
import { env } from "@/lib/env";
import { logger } from "@/server/lib/logger";

const log = logger.child({ script: "db-setup-langgraph" });
const connectionString = pgConnectionStringWithExplicitVerifyFull(env.DATABASE_URL);

async function main(): Promise<void> {
  const checkpointer = PostgresSaver.fromConnString(connectionString);
  await checkpointer.setup();
  log.info("db.checkpointer_ready");

  const store = PostgresStore.fromConnString(connectionString, {
    index: {
      dims: MEMORY_EMBEDDING_DIMENSIONS,
      embed: new OpenAIEmbeddings({
        model: MEMORY_EMBEDDING_MODEL,
        apiKey: env.OPENAI_API_KEY,
      }),
    },
  });
  await store.setup();
  log.info("db.memory_store_ready");

  await checkpointer.end();
  await store.stop();
}

main().catch((error: unknown) => {
  log.error("script.failed", {}, error);
  process.exitCode = 1;
});
