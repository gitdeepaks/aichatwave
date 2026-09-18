/**
 * A memory store that is down must not take chat down with it.
 *
 * Its own file because the store is replaced at module load: a stub installed
 * inside a test would be too late, since `memory-service` has already captured
 * its import by then — which is a way to write a test that passes without
 * testing anything, so it is worth being explicit about.
 */

import assert from "node:assert/strict";
import { setMemoryExtraction } from "../helpers/openai-stub";
import { stubModule } from "../helpers/module-stub";
import { dbTest, setupTestDatabase } from "../helpers/database";
import { seedUser } from "../helpers/seed";

setupTestDatabase();

const OUTAGE = new Error("vector store is down");

stubModule("@/server/memory/store", {
  getStore: () => ({
    search: () => Promise.reject(OUTAGE),
    get: () => Promise.reject(OUTAGE),
    put: () => Promise.reject(OUTAGE),
    delete: () => Promise.reject(OUTAGE),
  }),
});

const memoryService = () => import("@/server/memory/memory-service");

dbTest("the store really is the failing one", async () => {
  const user = await seedUser({});
  const { listMemories } = await memoryService();

  // Establishes that the stub took effect. Without this, the assertion below
  // would pass just as well against a working store holding no memories.
  await assert.rejects(() => listMemories(user.id), OUTAGE);
});

dbTest("prompt content degrades to (empty) instead of failing the turn", async () => {
  const user = await seedUser({});
  const { getMemoriesPromptContent } = await memoryService();

  assert.equal(await getMemoriesPromptContent({ userId: user.id, query: "anything" }), "(empty)");
});

dbTest("memory extraction never throws into the turn either", async () => {
  const user = await seedUser({});
  const { extractAndStoreMemories } = await memoryService();

  // The model decides there is something worth keeping, and the store refuses
  // to keep it. This runs behind the response in `waitUntil`, so a rejection
  // here would be an unhandled one rather than a failed request.
  setMemoryExtraction({
    should_write: true,
    memories: [{ text: "Deploys on Fridays.", is_new: true }],
  });

  await extractAndStoreMemories({
    userId: user.id,
    messageContent: "Remember that I deploy on Fridays.",
    existingMemoriesContent: "(empty)",
  });
});
