import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { BRAND_LOGO_SRC } from "@/lib/brand";
import { ROUTES } from "@/lib/routes";
import { SITE_NAME } from "@/lib/seo/site";
import { cn } from "@/lib/utils";

/**
 * The atmosphere and the primitives every public page is built from.
 *
 * This is deliberately a separate shell from `BrandAtmosphere`, which fills a
 * viewport and clips its overflow because it wraps an app that scrolls
 * internally. A marketing page scrolls as a document: the glows have to run
 * the length of it, not the height of one screen, and the grid has to tile
 * past the fold. Reusing the app shell here produced exactly one screen of
 * atmosphere and a flat black page beneath it.
 *
 * The visual language is the product's own, extended rather than replaced:
 * deep zinc canvas, an ember bloom from above, a 64px technical grid, hairline
 * rules as structure, and mono uppercase index labels. Orange is the only
 * accent and it is spent sparingly, which is what lets it read as a signal
 * when it does appear.
 *
 * ## The contrast floor: nothing below `fg-muted`
 *
 * Measured against this page's `surface-sunken` canvas, and against the glass
 * panels over it, which are within 0.2 of the same figure:
 *
 * ```
 *   fg-soft   13.5:1   fg-subtle   4.1:1  ← fails small text
 *   fg-muted   7.6:1   fg-faint    2.6:1  ← fails
 * ```
 *
 * Every piece of text here is under 18.66px, so WCAG AA asks 4.5:1 and the
 * three darkest steps do not reach it. These pages first shipped using all
 * three — Lighthouse found eleven failing nodes — because on an OLED display
 * `fg-faint` on near-black reads as "quiet", not as "illegible". It is
 * illegible to plenty of people on plenty of screens.
 *
 * So the scale is two tiers, not four: `fg-soft` for body copy and `fg-muted`
 * for everything secondary, including the mono micro-labels. The brand
 * accents are all comfortably above the floor (`brand-text-strong/55`, the
 * faintest one used, is 4.9:1).
 *
 * Reach for opacity rather than a darker step if something needs to recede
 * further — and then check it, because opacity composites against the canvas
 * and the arithmetic is not obvious.
 */

export function MarketingBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
      {/* Ember bloom from above the fold. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_45%_at_50%_-8%,var(--bloom-ember),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_38%_at_98%_22%,var(--bloom-crimson),transparent_58%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_34%_at_-6%_72%,var(--bloom-amber),transparent_54%)]" />
      {/* The technical grid, faded out at the edges so it never meets a border. */}
      <div className="absolute inset-0 opacity-[0.25] [background-image:linear-gradient(to_right,var(--hairline-subtle)_1px,transparent_1px),linear-gradient(to_bottom,var(--glass-fill)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_90%_75%_at_50%_30%,black,transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_58%,var(--vignette)_100%)]" />
    </div>
  );
}

/** The page's horizontal rail. Every section lines up on it. */
export function Container({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>{children}</div>;
}

/** `01 / threads` — the mono index label, with its ember dot. */
export function Eyebrow({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-2xs uppercase leading-4 tracking-[0.3em] text-brand-text-strong/65">
      <span className="size-1 rounded-full bg-brand/80 shadow-glow-ring" aria-hidden />
      {children}
    </span>
  );
}

/** A full-bleed hairline. The page's structural device, used instead of boxes. */
export function Hairline({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("hairline-rule h-px w-full", className)} aria-hidden />;
}

/** The glass panel, matching the auth card and the app's own surfaces. */
export const panelClass =
  "rounded-3xl border border-hairline bg-surface-sunken/50 shadow-elevation-xl inset-shadow-highlight backdrop-blur-glass-heavy supports-[backdrop-filter]:bg-surface-sunken/35";

export const primaryButtonClass =
  "brand-action inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-base font-semibold text-fg-bright shadow-glow-md transition-[transform,box-shadow,background-position] active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100";

export const secondaryButtonClass =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full border border-hairline bg-glass px-7 text-base font-medium text-fg transition-colors hover:border-brand-text-strong/30 hover:bg-glass-strong hover:text-fg-bright motion-reduce:transition-none";

export function BrandMark({ className }: Readonly<{ className?: string }>) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="brand-glass flex size-9 items-center justify-center overflow-hidden rounded-lg border border-hairline">
        {/* `width`/`height` are the *rendered* box, not the source's 512×285.
            They are what Next sizes the generated image from, and the source is
            a 59 KB PNG being painted into 24 CSS pixels — Lighthouse costed the
            difference at 58 KiB on every page. `unoptimized` used to be set
            here with no reason recorded; dropping it lets Next serve a WebP at
            the size actually needed. `alt=""` because the wordmark beside it
            already names the product, so announcing it twice is noise. */}
        <Image
          src={BRAND_LOGO_SRC}
          alt=""
          width={24}
          height={24}
          className="size-6 object-contain"
          priority
        />
      </span>
      <span className="text-base font-semibold tracking-[-0.02em] text-fg-bright">{SITE_NAME}</span>
    </span>
  );
}

/**
 * The public footer.
 *
 * Kept to what is true: the product's own routes and the docs that exist. A
 * footer full of `#` links is the fastest way to make a real product look like
 * a template.
 */
export function MarketingFooter() {
  return (
    <footer className="mt-32">
      <Hairline />
      <Container className="flex flex-col gap-8 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3">
          <BrandMark />
          <p className="max-w-[46ch] text-sm leading-6 text-fg-muted">
            A multi-model AI workspace with persistent threads, opt-in long-term memory and tools
            that fetch real data.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-7 gap-y-3">
          <FooterLink href={ROUTES.pricing}>Pricing</FooterLink>
          <FooterLink href={ROUTES.signIn}>Sign in</FooterLink>
          <FooterLink href={ROUTES.signUp}>Create account</FooterLink>
        </nav>
      </Container>
      <Container className="pb-12">
        <p className="font-mono text-2xs uppercase tracking-[0.24em] text-fg-muted">
          © {new Date().getFullYear()} {SITE_NAME}
        </p>
      </Container>
    </footer>
  );
}

function FooterLink({ href, children }: Readonly<{ href: string; children: ReactNode }>) {
  return (
    <Link
      href={href}
      className="rounded-sm text-sm text-fg-soft transition-colors hover:text-brand-text-strong motion-reduce:transition-none"
    >
      {children}
    </Link>
  );
}
