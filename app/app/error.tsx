"use client";

import { useEffect } from "react";

import { ErrorSurface } from "@/components/error/error-surface";
import { ROUTES } from "@/lib/routes";

/**
 * The workspace's own error boundary.
 *
 * `app/error.tsx` would catch these too, but it offers "Back to home" — which
 * for someone whose conversation just failed to render means leaving the
 * product for the marketing page. This one keeps them inside it.
 *
 * It renders below `app/app/layout.tsx`, so the sidebar and header survive and
 * `reset()` re-renders only the failed segment.
 */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side errors never reach `onRequestError`, so record them here.
    console.error("app.workspace_error_boundary", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <ErrorSurface
      title="This page hit a problem"
      description="Your conversations are safe. Trying again often works — the failure was recorded either way."
      digest={error.digest}
      onRetry={reset}
      href={ROUTES.app}
      hrefLabel="Back to chat"
    />
  );
}
