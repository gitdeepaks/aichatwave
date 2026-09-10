"use client";

import { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorSurfaceProps = {
  /** Short, human title. Not the thrown message — that is never client-safe. */
  title: string;
  description: string;
  /**
   * Next's hash of the server error. Present for server errors in production,
   * absent for client-side errors and in development (where the real message
   * is shown in the overlay instead).
   */
  digest?: string | undefined;
  /** Rendered as the primary action when the boundary can retry. */
  onRetry?: (() => void) | undefined;
  /** Secondary navigation, e.g. back to the app. */
  href?: string | undefined;
  hrefLabel?: string | undefined;
};

/**
 * The one error presentation, shared by `app/error.tsx`, `app/global-error.tsx`
 * and `app/not-found.tsx` so a failure looks like part of the product rather
 * than like the framework's default.
 *
 * Deliberately self-contained: `global-error.tsx` replaces the root layout, so
 * this cannot depend on any provider mounted there.
 */
export function ErrorSurface({
  title,
  description,
  digest,
  onRetry,
  href,
  hrefLabel,
}: ErrorSurfaceProps) {
  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_-10%,#31200f_0%,#09090b_42%,#050505_100%)] px-6 py-16">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_48%_-16%,rgba(249,115,22,0.28),transparent_58%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.28] [background-image:linear-gradient(to_right,rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:64px_64px]"
        aria-hidden
      />

      <div
        className={cn(
          "relative z-10 w-full max-w-lg rounded-2xl p-8 sm:p-10",
          "border border-white/10 bg-zinc-900/75 text-zinc-50 backdrop-blur-2xl",
          "shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_80px_-12px_rgba(0,0,0,0.65)]",
          "supports-[backdrop-filter]:bg-zinc-900/55",
        )}
      >
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">{description}</p>

        {digest ? <DigestBlock digest={digest} /> : null}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {onRetry ? (
            <Button
              onClick={onRetry}
              className="bg-orange-500 text-zinc-950 hover:bg-orange-400 focus-visible:ring-orange-400/60"
            >
              Try again
            </Button>
          ) : null}
          {href ? (
            <Button
              asChild
              variant="ghost"
              className="border border-white/10 text-zinc-300 hover:bg-white/5 hover:text-zinc-50"
            >
              <a href={href}>{hrefLabel ?? "Go back"}</a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The digest is the only handle a user has on a server error, so it is shown
 * verbatim and made copyable in one click — retyping a hash into a bug report
 * is how support tickets arrive with the wrong id.
 */
function DigestBlock({ digest }: { digest: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    // `navigator.clipboard` is unavailable over plain HTTP and in some
    // embedded webviews; failing to copy must not break the error page.
    void navigator.clipboard
      ?.writeText(digest)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  }, [digest]);

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-zinc-950/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.7rem] font-medium tracking-[0.14em] text-zinc-500 uppercase">
          Error reference
        </span>
        <Button
          type="button"
          onClick={copy}
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
          aria-label={copied ? "Error reference copied" : "Copy error reference"}
        >
          {copied ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <code className="mt-2 block font-mono text-sm break-all text-orange-300/90">{digest}</code>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        Include this when reporting the problem — it maps to the exact server log line.
      </p>
      <output className="sr-only" aria-live="polite">
        {copied ? "Error reference copied to clipboard" : ""}
      </output>
    </div>
  );
}
