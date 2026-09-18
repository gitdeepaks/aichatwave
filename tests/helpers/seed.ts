/**
 * Arranging database state for a test.
 *
 * Deliberately raw SQL rather than the app's own repositories: a test that
 * seeds through the code it is testing can pass while both halves are wrong
 * together. These write the columns the migrations declare, and nothing else.
 */

import { randomUUID } from "node:crypto";
import type { MessageParts } from "@/lib/ai/message-parts";
import { withTestClient } from "./database";

type SeededUser = { id: string; email: string };

/**
 * A local `user` row.
 *
 * `billingSyncedAt` is the interesting knob: null is a cold billing cache —
 * the one request that is allowed to consult Polar — and a recent timestamp is
 * a warm one, which must not.
 */
export async function seedUser(params: {
  id?: string;
  email?: string;
  name?: string;
  billingSyncedAt?: Date | null;
}): Promise<SeededUser> {
  const id = params.id ?? `user_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const email = params.email ?? `${id}@example.test`;

  await withTestClient((client) =>
    client.query(
      `insert into "user" (id, name, email, email_verified, billing_synced_at)
       values ($1, $2, $3, true, $4)
       on conflict (id) do update set billing_synced_at = excluded.billing_synced_at`,
      [id, params.name ?? "Test User", email, params.billingSyncedAt ?? null],
    ),
  );

  return { id, email };
}

type SeededThread = { id: string; userId: string; title: string };

export async function seedThread(params: {
  userId: string;
  id?: string;
  title?: string;
  createdAt?: Date;
  updatedAt?: Date;
  lastMessageAt?: Date | null;
  archivedAt?: Date | null;
  pinnedAt?: Date | null;
}): Promise<SeededThread> {
  const id = params.id ?? randomUUID();
  const title = params.title ?? "Seeded conversation";
  const createdAt = params.createdAt ?? new Date();

  await withTestClient((client) =>
    client.query(
      `insert into thread
         (id, title, user_id, created_at, updated_at, last_message_at, archived_at, pinned_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        title,
        params.userId,
        createdAt,
        params.updatedAt ?? createdAt,
        params.lastMessageAt ?? null,
        params.archivedAt ?? null,
        params.pinnedAt ?? null,
      ],
    ),
  );

  return { id, userId: params.userId, title };
}

type SeededMessage = { id: string; threadId: string };

export async function seedMessage(params: {
  threadId: string;
  id?: string;
  role?: "user" | "assistant" | "system";
  text?: string;
  parts?: MessageParts;
  modelId?: string | null;
  createdAt?: Date;
}): Promise<SeededMessage> {
  const id = params.id ?? randomUUID();
  const parts: MessageParts = params.parts ?? [{ type: "text", text: params.text ?? "Hello." }];

  await withTestClient((client) =>
    client.query(
      `insert into message (id, thread_id, role, parts, model_id, created_at)
       values ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        id,
        params.threadId,
        params.role ?? "user",
        JSON.stringify(parts),
        params.modelId ?? null,
        params.createdAt ?? new Date(),
      ],
    ),
  );

  return { id, threadId: params.threadId };
}

/** An active Polar subscription in the local mirror — what makes a user Pro. */
export async function seedSubscription(params: {
  userId: string;
  status?: string;
  currentPeriodEnd?: Date | null;
}): Promise<void> {
  await withTestClient((client) =>
    client.query(
      `insert into subscription
         (id, user_id, polar_subscription_id, polar_product_id, status, current_period_end)
       values ($1, $2, $3, $4, $5::subscription_status, $6)`,
      [
        randomUUID(),
        params.userId,
        `sub_${randomUUID().slice(0, 8)}`,
        "00000000-0000-0000-0000-000000000000",
        params.status ?? "active",
        params.currentPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ],
    ),
  );
}

/** Pre-spends part of a user's monthly allowance for the period containing `now`. */
export async function seedUsage(params: {
  userId: string;
  messages: number;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  await withTestClient((client) =>
    client.query(
      `insert into usage_counter (user_id, period_start, messages)
       values ($1, $2, $3)
       on conflict (user_id, period_start) do update set messages = excluded.messages`,
      [params.userId, periodStart, params.messages],
    ),
  );
}

/** Marks an account as being deleted, which blocks every user-owned write. */
export async function seedAccountDeletion(userId: string): Promise<void> {
  await withTestClient((client) =>
    client.query(`insert into account_deletion (user_id) values ($1)`, [userId]),
  );
}
