/**
 * `/api/memories` — the Memory Center's read and delete paths.
 *
 * Memories live in the LangGraph vector store, namespaced by user id, not in a
 * table with a `user_id` column and a foreign key. Isolation there is a
 * convention rather than something the database enforces, which is exactly why
 * it is worth a test that two users' memories really do not meet.
 */

import assert from "node:assert/strict";
import { signInAs, signOut } from "../helpers/environment";
import { dbTest, setupTestDatabase } from "../helpers/database";
import { seedUser } from "../helpers/seed";
import { apiRequest, callRoute, expectAppError, readJson } from "../helpers/http";
import { memoryListResponseSchema } from "@/lib/api/contracts";

setupTestDatabase({ memoryStore: true });

const memoriesRoute = () => import("@/app/api/memories/route");
const memoryRoute = () => import("@/app/api/memories/[memoryId]/route");

async function saveMemoryFor(userId: string, text: string): Promise<string> {
  const { saveMemory } = await import("@/server/memory/memory-service");
  const record = await saveMemory(userId, text);
  return record.id;
}

dbTest("listing memories anonymously is 401", async () => {
  signOut();
  const { GET } = await memoriesRoute();

  await expectAppError(await callRoute(GET, apiRequest("GET", "/api/memories")), "UNAUTHORIZED");
});

dbTest("a user sees their own memories and never someone else's", async () => {
  const owner = await seedUser({});
  const stranger = await seedUser({});

  await saveMemoryFor(owner.id, "Prefers TypeScript over JavaScript.");
  await saveMemoryFor(stranger.id, "Lives in a different namespace entirely.");

  signInAs(owner.id);
  const { GET } = await memoriesRoute();
  const response = await callRoute(GET, apiRequest("GET", "/api/memories"));

  assert.equal(response.status, 200);
  const body = memoryListResponseSchema.parse(await readJson(response));
  assert.deepEqual(
    body.memories.map((memory) => memory.content),
    ["Prefers TypeScript over JavaScript."],
  );
});

dbTest("deleting a memory the user does not have is 404", async () => {
  const owner = await seedUser({});
  const stranger = await seedUser({});
  const memoryId = await saveMemoryFor(owner.id, "Only the owner's.");

  const { DELETE } = await memoryRoute();

  signInAs(stranger.id);
  const foreign = await callRoute(DELETE, apiRequest("DELETE", `/api/memories/${memoryId}`), {
    memoryId,
  });
  await expectAppError(foreign, "NOT_FOUND");

  signInAs(owner.id);
  const deleted = await callRoute(DELETE, apiRequest("DELETE", `/api/memories/${memoryId}`), {
    memoryId,
  });
  assert.equal(deleted.status, 204);

  const again = await callRoute(DELETE, apiRequest("DELETE", `/api/memories/${memoryId}`), {
    memoryId,
  });
  await expectAppError(again, "NOT_FOUND");
});
