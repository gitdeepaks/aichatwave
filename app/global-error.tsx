"use client";

import { useEffect } from "react";

import "./globals.css";

import { ErrorSurface } from "@/components/error/error-surface";

/**
 * Last-resort boundary: catches errors thrown by the root layout itself, which
 * `app/error.tsx` cannot, since that renders *inside* the layout.
 *
 * It replaces the whole document, so it must supply `<html>` and `<body>` and
 * import the stylesheet itself — none of the root layout's fonts, theme
 * provider, or Clerk context exist here. Hence the plain `dark` class and
 * literal background rather than the app's tokens.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("app.global_error_boundary", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        <ErrorSurface
          title="The app failed to load"
          description="Something broke before the interface could start. This is on our side, not yours."
          digest={error.digest}
          onRetry={reset}
          href="/"
          hrefLabel="Reload"
        />
      </body>
    </html>
  );
}
