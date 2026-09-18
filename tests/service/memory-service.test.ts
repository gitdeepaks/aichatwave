/**
 * `memory-service`, against the real LangGraph vector store.
 *
 * Memories are the one store in this app with no foreign key and no `user_id`
 * column: isolation is a namespace convention, enforced only by every call
 * site passing the right array. That is worth testing directly rather than
 * only through the route, because the failure mode — one user's durable
 * personal facts injected into another user's system prompt — is the worst one
 * in the app and would be invisible in a diff.
 *
 * The embedder is a deterministic stand-in (see `tests/helpers/memory-store.ts`).
 * Nothing here asserts anything about semantic ranking, because nothing here
 * could honestly do so.
 */

import assert from "node:assert/strict";
import { openAiCalls, setMemoryExtraction } from "../helpers/openai-stub";
import { dbTest, setupTestDatabase } from "../helpers/database";
import { seedAccountDeletion, seedUser } from "../helpers/seed";
import { isAppError } from "@/server/lib/app-error";

setupTestDatabase({ memoryStore: true });

const memoryService = () => import("@/server/memory/memory-service");

dbTest("listMemories returns a user's own memories, newest first", async () => {
  const user = await seedUser({});
  const { listMemories, saveMemory } = await memoryService();

  await saveMemory(user.id, "Ships on Fridays.");
  await saveMemory(user.id, "Prefers Postgres to Redis for counters.");

  const memories = await listMemories(user.id);

  assert.equal(memories.length, 2);
  assert.ok(
    memories[0] !== undefined && memories[1] !== undefined,
    "both memories should be present",
  );
  assert.ok(
    memories[0].createdAt.getTime() >= memories[1].createdAt.getTime(),
    "memories must be newest first",
  );
  assert.deepEqual([...memories].map((memory) => memory.content).sort(), [
    "Prefers Postgres to Redis for counters.",
    "Ships on Fridays.",
  ]);
});

dbTest("one user's memories never appear in another's", async () => {
  const owner = await seedUser({});
  const stranger = await seedUser({});
  const { getMemoriesPromptContent, listMemories, saveMemory } = await memoryService();

  await saveMemory(owner.id, "Home address is on file.");

  assert.deepEqual(await listMemories(stranger.id), []);

  // The prompt-injection path is the one that matters most: "(empty)", not
  // someone else's facts.
  const prompt = await getMemoriesPromptContent({
    userId: stranger.id,
    query: "What is my address?",
  });
  assert.equal(prompt, "(empty)");
});

dbTest("getMemoriesPromptContent formats the user's own memories for the prompt", async () => {
  const user = await seedUser({});
  const { getMemoriesPromptContent, saveMemory } = await memoryService();

  await saveMemory(user.id, "Works in Europe/Berlin.");

  const prompt = await getMemoriesPromptContent({ userId: user.id, query: "What timezone?" });

  assert.match(prompt, /^- Works in Europe\/Berlin\.$/m);
});

dbTest("deleting a memory the user does not own is a typed 404", async () => {
  const owner = await seedUser({});
  const stranger = await seedUser({});
  const { deleteMemory, listMemories, saveMemory } = await memoryService();

  const memory = await saveMemory(owner.id, "Only mine.");

  await assert.rejects(
    () => deleteMemory({ userId: stranger.id, memoryId: memory.id }),
    (error: unknown) => isAppError(error) && error.code === "NOT_FOUND",
  );

  // …and the owner still has it.
  assert.equal((await listMemories(owner.id)).length, 1);

  await deleteMemory({ userId: owner.id, memoryId: memory.id });
  assert.deepEqual(await listMemories(owner.id), []);
});

dbTest("an account being deleted cannot write new memories", async () => {
  const user = await seedUser({});
  await seedAccountDeletion(user.id);
  const { saveMemory } = await memoryService();

  await assert.rejects(
    () => saveMemory(user.id, "Too late."),
    (error: unknown) => isAppError(error) && error.code === "CONFLICT",
  );
});

dbTest("extraction stores what the model marks new, and only that", async () => {
  const user = await seedUser({});
  const { extractAndStoreMemories, listMemories } = await memoryService();

  setMemoryExtraction({
    should_write: true,
    memories: [
      { text: "Runs the deploy on Fridays.", is_new: true },
      { text: "Already knew this one.", is_new: false },
      { text: "   ", is_new: true },
    ],
  });

  await extractAndStoreMemories({
    userId: user.id,
    messageContent: "I run the deploy on Fridays.",
    existingMemoriesContent: "(empty)",
  });

  assert.deepEqual(
    (await listMemories(user.id)).map((memory) => memory.content),
    ["Runs the deploy on Fridays."],
  );
});

dbTest("a message too short to hold a fact never reaches the model", async () => {
  const user = await seedUser({});
  const { extractAndStoreMemories, listMemories } = await memoryService();

  openAiCalls.length = 0;
  setMemoryExtraction({ should_write: true, memories: [{ text: "ok", is_new: true }] });

  await extractAndStoreMemories({
    userId: user.id,
    messageContent: "ok",
    existingMemoriesContent: "(empty)",
  });

  assert.deepEqual(openAiCalls, [], "a two-character message must not cost an extraction call");
  assert.deepEqual(await listMemories(user.id), []);
});

dbTest("extraction respects a pending account deletion", async () => {
  const user = await seedUser({});
  await seedAccountDeletion(user.id);
  const { extractAndStoreMemories } = await memoryService();

  setMemoryExtraction({
    should_write: true,
    memories: [{ text: "Should never be written.", is_new: true }],
  });

  // Non-fatal, like every other memory failure — but nothing is stored.
  await extractAndStoreMemories({
    userId: user.id,
    messageContent: "Remember something about me.",
    existingMemoriesContent: "(empty)",
  });
});
