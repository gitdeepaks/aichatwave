/**
 * The gate on the operational surfaces.
 *
 * Enforced at the resource, like every other authorization check in this app —
 * see the note in `proxy.ts` for why middleware is not where this belongs. A
 * matcher in the proxy would be bypassable and would give the false impression
 * that `/admin` is covered.
 *
 * The refusal is a 404, not a 403. A 403 confirms that someone, somewhere, is
 * an admin; "there is nothing here" says less. On the API routes this is a
 * true 404 with the typed envelope. On the *page* it is not — see the note in
 * `app/(chat)/admin/operations/page.tsx`: Next commits a 200 and the app shell
 * before a page inside a layout can call `notFound()`, so the route is
 * discoverable by status code even though nothing it guards is. The path is in
 * the repo and in `.env.example`, so that gap costs nothing; the data is what
 * matters and the data never renders.
 *
 * The real reason is logged either way, so a locked-out operator can still find
 * out why.
 */

import { adminUserIds } from "@/lib/env";
import { isAdminUser } from "@/lib/security/admin-policy";
import { requireSessionUserId } from "@/server/auth/session";
import { AppError } from "@/server/lib/app-error";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

/** Resolves the signed-in user and confirms they are on the allowlist, or throws a typed 404. */
export async function requireAdminUserId(log: Logger = rootLogger): Promise<string> {
  const userId = await requireSessionUserId();

  if (!isAdminUser({ userId, adminUserIds })) {
    log.warn("admin.access_denied", { userId, configuredAdmins: adminUserIds.size });
    throw new AppError("NOT_FOUND", "Not found.");
  }

  return userId;
}

/** Non-throwing variant, for a page that should redirect rather than render an error. */
export function isAdmin(userId: string | null): boolean {
  if (userId === null) return false;
  return isAdminUser({ userId, adminUserIds });
}
