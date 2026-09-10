import type { Metadata } from "next";

import { ErrorSurface } from "@/components/error/error-surface";

export const metadata: Metadata = {
  title: "Page not found — AIChatWave",
  // A 404 is not something to index.
  robots: { index: false, follow: false },
};

/**
 * No digest here: a 404 is a routing outcome, not a thrown error, so there is
 * no server log line to correlate and nothing for the user to quote.
 */
export default function NotFound() {
  return (
    <ErrorSurface
      title="Page not found"
      description="That URL doesn't match anything here. It may have been deleted, or the link may be wrong."
      href="/"
      hrefLabel="Back to chat"
    />
  );
}
