/**
 * `/api/threads` and `/api/threads/[threadId]`, through the real handlers.
 *
 * These are the ownership paths Phase A could only check by hand: anonymous,
 * owner, and a signed-in stranger asking for someone else's conversation. The
 * 403/404 distinction is the interesting one — "not yours" and "does not
 * exist" are different answers, and only a call made as a second real user can
 * tell them apart.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { signInAs, signOut } from "../helpers/environment";
import { dbTest, setupTestDatabase } from "../helpers/database";
import { seedThread, seedUser } from "../helpers/seed";
import { apiRequest, callRoute, expectAppError, readJson } from "../helpers/http";
import { threadListResponseSchema, threadResponseSchema } from "@/lib/api/contracts";

setupTestDatabase();

const threadsRoute = () => import("@/app/api/threads/route");
const threadRoute = () => import("@/app/api/threads/[threadId]/route");

dbTest("anonymous listing is 401", async () => {
  signOut();
  const { GET } = await threadsRoute();

  const response = await callRoute(GET, apiRequest("GET", "/api/threads"));

  await expectAppError(response, "UNAUTHORIZED");
});

dbTest("an owner sees only their own threads, newest first", async () => {
  const owner = await seedUser({});
  const stranger = await seedUser({});

  const older = await seedThread({
    userId: owner.id,
    title: "Older",
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });
  const newer = await seedThread({
    userId: owner.id,
    title: "Newer",
    updatedAt: new Date("2026-02-01T00:00:00Z"),
  });
  await seedThread({ userId: stranger.id, title: "Theirs" });

  signInAs(owner.id);
  const { GET } = await threadsRoute();
  const response = await callRoute(GET, apiRequest("GET", "/api/threads"));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("x-request-id") ?? "", /\S/);

  const body = threadListResponseSchema.parse(await readJson(response));
  assert.deepEqual(
    body.threads.map((thread) => thread.id),
    [newer.id, older.id],
  );
});

dbTest("a foreign thread is 403 and a missing one is 404", async () => {
  const owner = await seedUser({});
  const stranger = await seedUser({});
  const thread = await seedThread({ userId: owner.id });

  signInAs(stranger.id);
  const { GET } = await threadRoute();

  const foreign = await callRoute(GET, apiRequest("GET", `/api/threads/${thread.id}`), {
    threadId: thread.id,
  });
  await expectAppError(foreign, "FORBIDDEN");

  const missing = await callRoute(GET, apiRequest("GET", `/api/threads/${randomUUID()}`), {
    threadId: randomUUID(),
  });
  await expectAppError(missing, "NOT_FOUND");
});

dbTest("creating a thread returns 201 and the same id twice is 409", async () => {
  const user = await seedUser({});
  signInAs(user.id);

  const { POST } = await threadsRoute();
  const id = randomUUID();

  const created = await callRoute(
    POST,
    apiRequest("POST", "/api/threads", { body: { id, title: "Planning" } }),
  );
  assert.equal(created.status, 201);

  const body = threadResponseSchema.parse(await readJson(created));
  assert.equal(body.thread.id, id);
  assert.equal(body.thread.title, "Planning");

  const duplicate = await callRoute(
    POST,
    apiRequest("POST", "/api/threads", { body: { id, title: "Planning" } }),
  );
  await expectAppError(duplicate, "CONFLICT");
});

dbTest("a malformed body is 400 and names the field", async () => {
  const user = await seedUser({});
  signInAs(user.id);

  const { POST } = await threadsRoute();
  const response = await callRoute(
    POST,
    apiRequest("POST", "/api/threads", { body: { id: "not-a-uuid" } }),
  );

  const error = await expectAppError(response, "INVALID_REQUEST");
  assert.deepEqual(
    error.issues?.map((issue) => issue.path),
    ["body.id"],
  );
});

dbTest("a body that is not JSON at all is 400 INVALID_JSON", async () => {
  const user = await seedUser({});
  signInAs(user.id);

  const { POST } = await threadsRoute();
  const response = await callRoute(
    POST,
    apiRequest("POST", "/api/threads", { rawBody: "{not json" }),
  );

  await expectAppError(response, "INVALID_JSON");
});

dbTest("a tampered cursor is 400 INVALID_CURSOR", async () => {
  const user = await seedUser({});
  signInAs(user.id);

  const { GET } = await threadsRoute();
  const response = await callRoute(GET, apiRequest("GET", "/api/threads?cursor=bm90LWEtY3Vyc29y"));

  await expectAppError(response, "INVALID_CURSOR");
});

dbTest("renaming and deleting are owner-only", async () => {
  const owner = await seedUser({});
  const stranger = await seedUser({});
  const thread = await seedThread({ userId: owner.id, title: "Before" });

  const { PATCH, DELETE } = await threadRoute();

  signInAs(stranger.id);
  const rejected = await callRoute(
    PATCH,
    apiRequest("PATCH", `/api/threads/${thread.id}`, { body: { title: "Hijacked" } }),
    { threadId: thread.id },
  );
  await expectAppError(rejected, "FORBIDDEN");

  signInAs(owner.id);
  const renamed = await callRoute(
    PATCH,
    apiRequest("PATCH", `/api/threads/${thread.id}`, { body: { title: "After" } }),
    { threadId: thread.id },
  );
  assert.equal(renamed.status, 200);
  assert.equal(threadResponseSchema.parse(await readJson(renamed)).thread.title, "After");

  const deleted = await callRoute(DELETE, apiRequest("DELETE", `/api/threads/${thread.id}`), {
    threadId: thread.id,
  });
  assert.equal(deleted.status, 204);

  const gone = await callRoute(DELETE, apiRequest("DELETE", `/api/threads/${thread.id}`), {
    threadId: thread.id,
  });
  await expectAppError(gone, "NOT_FOUND");
});

dbTest("a write from a foreign origin is refused before anything is parsed", async () => {
  const user = await seedUser({});
  signInAs(user.id);

  const { POST } = await threadsRoute();
  const response = await callRoute(
    POST,
    apiRequest("POST", "/api/threads", {
      body: { title: "From elsewhere" },
      origin: "https://attacker.example",
    }),
  );

  await expectAppError(response, "FORBIDDEN");
});
