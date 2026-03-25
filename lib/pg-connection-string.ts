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
