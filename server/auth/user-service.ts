/**
 * Keeps a local `user` row in step with Clerk.
 *
 * Clerk is the source of truth for identity, but this database has foreign keys
 * pointing at `user.id` (`thread.user_id`, `subscription.user_id`), so a row has
 * to exist before a user's first write.
 *
 * Webhooks alone are not enough for that. Clerk delivers them asynchronously,
 * so a brand-new user who signs up and immediately sends a message can beat
 * `user.created` to the database and hit a foreign-key violation. Provisioning
 * is therefore just-in-time and idempotent: it runs on the write paths that
 * need the row, and the webhook keeps the row current afterwards.
 */

import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema/auth-schema";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
};

const FALLBACK_NAME = "New user";

/** Flattens Clerk's name fields into the single `name` column this app stores. */
function resolveName(params: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  email: string | null;
}): string {
  const full = [params.firstName, params.lastName].filter(Boolean).join(" ").trim();
  if (full.length > 0) return full;
  if (params.username && params.username.length > 0) return params.username;
  if (params.email && params.email.length > 0) return params.email;
  return FALLBACK_NAME;
}

export type UpsertUserInput = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
};

/**
 * Idempotent write of a Clerk identity into the local table. Safe to call on
 * every request that needs the row to exist, and safe to call from the webhook.
 */
export async function upsertUser(input: UpsertUserInput): Promise<void> {
  const now = new Date();

  await db
    .insert(user)
    .values({
      id: input.id,
      name: input.name,
      email: input.email,
      emailVerified: input.emailVerified,
      image: input.image,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: user.id,
      set: {
        name: input.name,
        email: input.email,
        emailVerified: input.emailVerified,
        image: input.image,
        updatedAt: now,
      },
    });
}

export async function deleteUser(userId: string): Promise<void> {
  // Threads, messages, and subscriptions cascade from this row.
  await db.delete(user).where(eq(user.id, userId));
}

async function localUserExists(userId: string): Promise<boolean> {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  return rows.length > 0;
}

/**
 * Guarantees a `user` row exists for the signed-in Clerk user before a write
 * that depends on it. Reads Clerk directly rather than waiting for a webhook.
 */
export async function ensureUserProvisioned(
  userId: string,
  log: Logger = rootLogger,
): Promise<void> {
  if (await localUserExists(userId)) return;

  const clerkUser = await currentUser();
  if (!clerkUser || clerkUser.id !== userId) {
    // The session is valid but Clerk did not return the profile. Write a
    // placeholder so the foreign key holds; the webhook will correct it.
    await upsertUser({
      id: userId,
      name: FALLBACK_NAME,
      email: `${userId}@placeholder.invalid`,
      emailVerified: false,
      image: null,
    });
    log.warn("user.provisioned_without_profile", { userId });
    return;
  }

  const primaryEmail =
    clerkUser.emailAddresses.find((address) => address.id === clerkUser.primaryEmailAddressId) ??
    clerkUser.emailAddresses[0];

  await upsertUser({
    id: clerkUser.id,
    name: resolveName({
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      username: clerkUser.username,
      email: primaryEmail?.emailAddress ?? null,
    }),
    email: primaryEmail?.emailAddress ?? `${userId}@placeholder.invalid`,
    emailVerified: primaryEmail?.verification?.status === "verified",
    image: clerkUser.imageUrl.length > 0 ? clerkUser.imageUrl : null,
  });

  log.info("user.provisioned", { userId });
}

export { resolveName };
