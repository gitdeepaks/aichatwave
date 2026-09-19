import type { Metadata } from "next";
import { connection } from "next/server";

import { ErrorSurface } from "@/components/error/error-surface";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Page not found",
  // A 404 is not something to index.
  robots: { index: false, follow: false },
};

/**
 * No digest here: a 404 is a routing outcome, not a thrown error, so there is
 * no server log line to correlate and nothing for the user to quote.
 *
 * `connection()` opts the page out of static generation, which it needs for
 * the same reason the marketing pages do. `script-src` carries a per-request
 * nonce and `'strict-dynamic'`, so `'self'` is inert and only a nonce
 * authorizes a script — and a page prerendered at build time has no nonce to
 * carry. This page *was* prerendered, and its bundle was consequently blocked
 * in every browser: the markup rendered, nothing hydrated, and Clerk and the
 * toaster never loaded. It went unnoticed because the page is a heading and a
 * link, neither of which needs JavaScript.
 */
export default async function NotFound() {
  await connection();

  return (
    <ErrorSurface
      title="Page not found"
      description="That URL doesn't match anything here. It may have been deleted, or the link may be wrong."
      href={ROUTES.home}
      hrefLabel="Back to home"
    />
  );
}
