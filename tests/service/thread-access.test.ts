/**
 * Thread access, at the service boundary rather than through HTTP.
 *
 * `ensureThreadAccess` and `listThreadMessages` encode a three-way answer that
 * no route can express on its own: *yours*, *someone else's*, and *not written
 * yet*. The third is not a missing row to be tolerated — it is an ordinary
 * state, because the composer navigates to `/chat/{id}` before the chat request
 * that creates it, deliberately, so the rate-limit and quota gates run before
 * anything is written. Collapsing it into a 404 made every new conversation
 * flash an error page, and nothing stopped that from happening again.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dbTest, setupTestDatabase, withTestClient } from "../helpers/database";
import { seedMessage, seedThread, seedUser } from "../helpers/seed";
import { isAppError } from "@/server/lib/app-error";

setupTestDatabase();

const threadService = () => import("@/server/chat/thread-service");
const chatService = () => import("@/server/chat/chat-service");

/** The `AppError` code a call rejected with, or the failure itself if it was not one. */
async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (isAppError(error)) return error.code;
    throw error;
  }
  throw new Error("Expected the call to reject, but it resolved.");
}

dbTest("ensureThreadAccess creates the thread on the first message", async () => {
  const user = await seedUser({});
  const { ensureThreadAccess } = await chatService();
  const threadId = randomUUID();

  const created = await ensureThreadAccess({
    userId: user.id,
    threadId,
    messageContent: "How do I rotate the Polar token?",
  });

  assert.equal(created, true);

  const rows = await withTestClient((client) =>
    client.query<{ title: string; user_id: string }>(
      "select title, user_id from thread where id = $1",
      [threadId],
    ),
  );
  assert.equal(rows.rows[0]?.user_id, user.id);
  // The title is derived from the first message, not left as a placeholder.
  assert.match(rows.rows[0]?.title ?? "", /Polar/);
});

dbTest("ensureThreadAccess provisions a user row the webhook has not delivered yet", async () => {
  // No `seedUser`: this is the sign-up race the just-in-time provisioning
  // exists for — a user who sends a message before Clerk's `user.created`
  // webhook arrives. Without it, `thread.user_id`'s foreign key fails.
  const userId = `user_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const { ensureThreadAccess } = await chatService();

  await ensureThreadAccess({ userId, threadId: randomUUID(), messageContent: "First ever." });

  const rows = await withTestClient((client) =>
    client.query<{ id: string }>('select id from "user" where id = $1', [userId]),
  );
  assert.equal(rows.rows.length, 1);
});

dbTest("ensureThreadAccess is idempotent for the owner and closed to everyone else", async () => {
  const owner = await seedUser({});
  const stranger = await seedUser({});
  const thread = await seedThread({ userId: owner.id });

  const { ensureThreadAccess } = await chatService();

  assert.equal(
    await ensureThreadAccess({
      userId: owner.id,
      threadId: thread.id,
      messageContent: "Second turn.",
    }),
    false,
  );

  assert.equal(
    await codeOf(() =>
      ensureThreadAccess({
        userId: stranger.id,
        threadId: thread.id,
        messageContent: "Let me in.",
      }),
    ),
    "FORBIDDEN",
  );
});

dbTest("requireOwnedThread separates 'not yours' from 'does not exist'", async () => {
  const owner = await seedUser({});
  const stranger = await seedUser({});
  const thread = await seedThread({ userId: owner.id });

  const { requireOwnedThread } = await threadService();

  assert.equal((await requireOwnedThread({ threadId: thread.id, userId: owner.id })).id, thread.id);

  assert.equal(
    await codeOf(() => requireOwnedThread({ threadId: thread.id, userId: stranger.id })),
    "FORBIDDEN",
  );
  assert.equal(
    await codeOf(() => requireOwnedThread({ threadId: randomUUID(), userId: stranger.id })),
    "NOT_FOUND",
  );
});

dbTest("listThreadMessages tolerates a thread that does not exist yet", async () => {
  const user = await seedUser({});
  const { listThreadMessages } = await threadService();

  const page = await listThreadMessages({ threadId: randomUUID(), userId: user.id });

  assert.deepEqual(page, { items: [], nextCursor: null });
});

dbTest("listThreadMessages returns a chronological window bounded by its limit", async () => {
  const user = await seedUser({});
  const thread = await seedThread({ userId: user.id });

  for (let index = 0; index < 4; index += 1) {
    await seedMessage({
      threadId: thread.id,
      text: `turn ${index}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    });
  }

  const { listThreadMessages } = await threadService();
  const page = await listThreadMessages({ threadId: thread.id, userId: user.id, limit: 2 });

  assert.equal(page.items.length, 2);
  assert.notEqual(page.nextCursor, null);
  assert.deepEqual(
    page.items.map((message) => message.parts.map((part) => textOf(part)).join("")),
    ["turn 2", "turn 3"],
  );
});

dbTest("listThreadMessages refuses a thread the user does not own", async () => {
  const owner = await seedUser({});
  const stranger = await seedUser({});
  const thread = await seedThread({ userId: owner.id });

  const { listThreadMessages } = await threadService();

  assert.equal(
    await codeOf(() => listThreadMessages({ threadId: thread.id, userId: stranger.id })),
    "FORBIDDEN",
  );
});

function textOf(part: { type: string; text?: string }): string {
  return part.type === "text" ? (part.text ?? "") : "";
}
