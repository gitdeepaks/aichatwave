/**
 * Thread history, search, and export.
 *
 * The ownership rule is not uniform across these three, and that is deliberate
 * rather than an oversight: `readThreadWindow` tolerates a thread that does not
 * exist yet (the composer navigates to `/chat/{id}` before the row is written),
 * while `listThreadMessages` does not. Both still refuse a thread that belongs
 * to someone else. These tests pin that difference down so a later
 * simplification cannot quietly collapse "not yours" into "not yet".
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { signInAs, signOut } from "../helpers/environment";
import { dbTest, setupTestDatabase } from "../helpers/database";
import { seedMessage, seedThread, seedUser } from "../helpers/seed";
import { apiRequest, callRoute, expectAppError, readJson } from "../helpers/http";
import { messageListResponseSchema, messageSearchResponseSchema } from "@/lib/api/contracts";

setupTestDatabase();

const messagesRoute = () => import("@/app/api/threads/[threadId]/messages/route");
const searchRoute = () => import("@/app/api/threads/search/route");
const exportRoute = () => import("@/app/api/threads/[threadId]/export/route");

dbTest("history is chronological and paginates by cursor", async () => {
  const user = await seedUser({});
  const thread = await seedThread({ userId: user.id });

  for (let index = 0; index < 5; index += 1) {
    await seedMessage({
      threadId: thread.id,
      text: `message ${index}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    });
  }

  signInAs(user.id);
  const { GET } = await messagesRoute();

  const first = await callRoute(
    GET,
    apiRequest("GET", `/api/threads/${thread.id}/messages?limit=2`),
    { threadId: thread.id },
  );
  assert.equal(first.status, 200);

  const firstPage = messageListResponseSchema.parse(await readJson(first));
  assert.equal(firstPage.messages.length, 2);
  assert.notEqual(firstPage.nextCursor, null);

  // Each page is chronological; the cursor asks for the page immediately before.
  assert.deepEqual(
    firstPage.messages.map((message) => textOf(message.parts)),
    ["message 3", "message 4"],
  );

  const second = await callRoute(
    GET,
    apiRequest(
      "GET",
      `/api/threads/${thread.id}/messages?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor ?? "")}`,
    ),
    { threadId: thread.id },
  );

  const secondPage = messageListResponseSchema.parse(await readJson(second));
  assert.deepEqual(
    secondPage.messages.map((message) => textOf(message.parts)),
    ["message 1", "message 2"],
  );
});

dbTest("history of a foreign thread is 403 and of a missing thread is 404", async () => {
  const owner = await seedUser({});
  const stranger = await seedUser({});
  const thread = await seedThread({ userId: owner.id });
  await seedMessage({ threadId: thread.id, text: "private" });

  signInAs(stranger.id);
  const { GET } = await messagesRoute();

  await expectAppError(
    await callRoute(GET, apiRequest("GET", `/api/threads/${thread.id}/messages`), {
      threadId: thread.id,
    }),
    "FORBIDDEN",
  );

  const missing = randomUUID();
  await expectAppError(
    await callRoute(GET, apiRequest("GET", `/api/threads/${missing}/messages`), {
      threadId: missing,
    }),
    "NOT_FOUND",
  );
});

dbTest("search spans the user's threads and stops at their own", async () => {
  const owner = await seedUser({});
  const stranger = await seedUser({});

  const mine = await seedThread({ userId: owner.id, title: "Mine" });
  const theirs = await seedThread({ userId: stranger.id, title: "Theirs" });

  await seedMessage({ threadId: mine.id, text: "the migration playbook lives here" });
  await seedMessage({ threadId: theirs.id, text: "the migration playbook is secret" });

  signInAs(owner.id);
  const { GET } = await searchRoute();
  const response = await callRoute(GET, apiRequest("GET", "/api/threads/search?q=migration"));

  assert.equal(response.status, 200);
  const body = messageSearchResponseSchema.parse(await readJson(response));
  assert.deepEqual(
    body.results.map((result) => result.thread.id),
    [mine.id],
  );
});

dbTest("search with no query is 400", async () => {
  const user = await seedUser({});
  signInAs(user.id);

  const { GET } = await searchRoute();
  const error = await expectAppError(
    await callRoute(GET, apiRequest("GET", "/api/threads/search?q=%20%20")),
    "INVALID_REQUEST",
  );

  assert.deepEqual(
    error.issues?.map((issue) => issue.path),
    ["query.q"],
  );
});

dbTest("anonymous search is 401", async () => {
  signOut();
  const { GET } = await searchRoute();

  await expectAppError(
    await callRoute(GET, apiRequest("GET", "/api/threads/search?q=anything")),
    "UNAUTHORIZED",
  );
});

dbTest("export returns the owner's conversation and refuses everyone else's", async () => {
  const owner = await seedUser({});
  const stranger = await seedUser({});
  const thread = await seedThread({ userId: owner.id, title: "Exportable" });
  await seedMessage({ threadId: thread.id, text: "something worth keeping" });

  const { GET } = await exportRoute();

  signInAs(owner.id);
  const exported = await callRoute(
    GET,
    apiRequest("GET", `/api/threads/${thread.id}/export?format=markdown`),
    { threadId: thread.id },
  );
  assert.equal(exported.status, 200);
  assert.match(await exported.text(), /something worth keeping/);

  signInAs(stranger.id);
  await expectAppError(
    await callRoute(GET, apiRequest("GET", `/api/threads/${thread.id}/export?format=json`), {
      threadId: thread.id,
    }),
    "FORBIDDEN",
  );
});

dbTest("export in an unsupported format is 400", async () => {
  const user = await seedUser({});
  const thread = await seedThread({ userId: user.id });
  signInAs(user.id);

  const { GET } = await exportRoute();
  await expectAppError(
    await callRoute(GET, apiRequest("GET", `/api/threads/${thread.id}/export?format=pdf`), {
      threadId: thread.id,
    }),
    "INVALID_REQUEST",
  );
});

function textOf(parts: { type: string; text?: string }[]): string {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}
