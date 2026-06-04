import { OpenAIEmbeddings } from "@langchain/openai";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { pgConnectionStringWithExplicitVerifyFull } from "@/lib/pg-connection-string";
import { env } from "@/lib/env";

const embeddings = new OpenAIEmbeddings({ model: "text-embedding-3-small" });

const store = PostgresStore.fromConnString(
  pgConnectionStringWithExplicitVerifyFull(env.DATABASE_URL),
  {
    index: {
      dims: 1536,
      embed: embeddings,
    },
  },
);

let setupDone = false;

export async function getStore() {
  if (!setupDone) {
    await store.setup();
    setupDone = true;
  }
  return store;
}
