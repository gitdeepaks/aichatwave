/**
 * Server-side session access, backed by Clerk.
 *
 * The returned id is the Clerk user id and it is the same value stored in
 * `user.id`, so every existing foreign key (`thread.user_id`,
 * `subscription.user_id`) keeps pointing at the right row without a translation
 * table.
 */

import { auth } from "@clerk/nextjs/server";
import { AppError } from "@/server/lib/app-error";

/** Resolves the signed-in user id from the current request, or null when anonymous. */
export async function getSessionUserId(): Promise<string | null> {
  const { userId } = await auth();
  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

/** Like {@link getSessionUserId} but throws a typed 401 for anonymous requests. */
export async function requireSessionUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) {
    throw new AppError("UNAUTHORIZED", "You must be signed in to do that.");
  }
  return userId;
}
