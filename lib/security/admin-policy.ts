/**
 * Who may read the operational surfaces (cost, SLOs).
 *
 * An explicit allowlist of user ids, parsed from one environment variable,
 * rather than a role on the user row. Three reasons it is deliberately this
 * dull:
 *
 *  - There is no roles model in this app, and inventing one to gate two
 *    read-only pages would be a schema, a migration, and an admin UI to manage
 *    it — all of which then have to be secured themselves.
 *  - An allowlist in configuration cannot be granted by a bug in the app. No
 *    request, no webhook, and no row update can add someone to it.
 *  - It fails closed by construction: unset means nobody, not everybody. That
 *    is the property that matters, because the failure mode of the alternative
 *    is every signed-in user reading every other user's spend.
 *
 * Kept pure and client-safe so the parsing has a test; the assertion that uses
 * it lives in `server/auth/admin.ts`.
 */

/**
 * Parses the comma-separated allowlist.
 *
 * Whitespace and empty entries are dropped so a trailing comma or a value
 * pasted across two lines does not silently create an empty-string id that
 * matches nothing — or, worse, matches an empty `userId`.
 */
export function parseAdminUserIds(raw: string | undefined): ReadonlySet<string> {
  if (raw === undefined) return new Set();
  return new Set(
    raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
}

/**
 * An empty allowlist admits nobody — including on a deployment that simply
 * forgot to set it. "No admins configured" is a deployment that has no
 * dashboard, which is recoverable; the other reading is a data breach.
 */
export function isAdminUser(params: {
  readonly userId: string;
  readonly adminUserIds: ReadonlySet<string>;
}): boolean {
  if (params.userId.length === 0) return false;
  return params.adminUserIds.has(params.userId);
}
