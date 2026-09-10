"use client";

import { useEffect } from "react";

import { ErrorSurface } from "@/components/error/error-surface";

/**
 * Route-level error boundary. Catches render and data errors below the root
 * layout, which keeps the shell and lets `reset()` re-render the segment
 * without a full page load.
 *
 * `error.message` is the framework's redacted placeholder in production, so it
 * is deliberately not shown — `digest` is the only value that identifies this
 * failure, and `instrumentation.ts` logs it against the request.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side errors never reach `onRequestError`, so record them here.
    console.error("app.error_boundary", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <ErrorSurface
      title="Something went wrong"
      description="This page hit an unexpected error. Trying again often works — the failure was recorded either way."
      digest={error.digest}
      onRetry={reset}
      href="/"
      hrefLabel="Back to chat"
    />
  );
}
