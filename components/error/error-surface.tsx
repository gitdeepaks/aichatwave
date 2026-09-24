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
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden atmosphere-ground px-6 py-16">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_55%_at_48%_-16%,var(--bloom-ember),transparent_58%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.28] [background-image:linear-gradient(to_right,var(--hairline-subtle)_1px,transparent_1px),linear-gradient(to_bottom,var(--glass-fill)_1px,transparent_1px)] [background-size:64px_64px]"
        aria-hidden
      />

      <div
        className={cn(
          "relative z-10 w-full max-w-lg rounded-2xl p-8 sm:p-10",
          "border border-hairline bg-surface-raised/75 text-fg-bright backdrop-blur-glass-heavy",
          "shadow-elevation-xl",
          "supports-[backdrop-filter]:bg-surface-raised/55",
        )}
      >
        <h1 className="text-2xl font-semibold tracking-tight text-fg-bright sm:text-3xl">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{description}</p>

        {digest ? <DigestBlock digest={digest} /> : null}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {onRetry ? (
            <Button
              onClick={onRetry}
              className="bg-brand-strong text-brand-foreground hover:bg-brand focus-visible:ring-brand/60"
            >
              Try again
            </Button>
          ) : null}
          {href ? (
            <Button
              asChild
              variant="ghost"
              className="border border-hairline text-fg-soft hover:bg-glass hover:text-fg-bright"
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
    <div className="mt-6 rounded-xl border border-hairline bg-surface-sunken/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium tracking-[0.14em] text-fg-subtle uppercase">
          Error reference
        </span>
        <Button
          type="button"
          onClick={copy}
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-fg-muted hover:bg-glass hover:text-fg-strong"
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
      <code className="mt-2 block font-mono text-sm break-all text-brand-text/90">{digest}</code>
      <p className="mt-3 text-xs leading-relaxed text-fg-subtle">
        Include this when reporting the problem — it maps to the exact server log line.
      </p>
      <output className="sr-only" aria-live="polite">
        {copied ? "Error reference copied to clipboard" : ""}
      </output>
    </div>
  );
}
