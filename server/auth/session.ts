import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { AppError } from "@/server/lib/app-error";

/** Resolves the signed-in user id from the current request, or null when anonymous. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const userId = session?.user.id;
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
