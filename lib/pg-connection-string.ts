/**
 * pg v8 warns on sslmode=require|prefer|verify-ca (soon libpq semantics in pg v9).
 * Use verify-full to keep today’s strict verification and silence the warning.
 */
export function pgConnectionStringWithExplicitVerifyFull(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const mode = url.searchParams.get("sslmode");
    if (mode === "require" || mode === "prefer" || mode === "verify-ca") {
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }
  } catch {
    /* invalid URL — return unchanged */
  }
  return connectionString;
}

/**
 * Whether a connection string points at Neon, and therefore needs Neon's
 * WebSocket driver rather than a plain TCP one.
 *
 * Host-based rather than a separate env var because the host already carries
 * the answer: `*.neon.tech` is Neon and nothing else is. That keeps a single
 * `DATABASE_URL` as the whole database configuration — production points at
 * Neon and gets the serverless driver, `docker-compose.yaml` and CI point at a
 * plain Postgres and get `pg`, and neither has to remember a second variable.
 *
 * An unparseable string is treated as Neon so that a malformed production URL
 * fails inside the driver it was written for, rather than silently changing
 * which driver a deployment uses.
 */
export function isNeonConnectionString(connectionString: string): boolean {
  try {
    return new URL(connectionString).hostname.toLowerCase().endsWith(".neon.tech");
  } catch {
    return true;
  }
}
