import Image from "next/image";
import type { ReactNode } from "react";
import { BRAND_LOGO_SRC } from "@/lib/brand";

/**
 * The branded frame around Clerk's sign-in and sign-up widgets.
 *
 * Layout is a two-column split from `lg` up: the product argument on the left,
 * the auth panel on the right. Below `lg` it collapses to the panel alone,
 * centred.
 *
 * ## One gutter, one rail
 *
 * Everything inside the panel — heading block, Clerk's buttons, Clerk's footer,
 * every divider — is inset by the single `--auth-gutter` value declared on the
 * panel. Before this the three stacks used 36px / 28px / 32px respectively and
 * nothing lined up vertically; Clerk's own `padding: 16px 32px` on the footer
 * rows is zeroed in `app/globals.css` so they inherit this rail too.
 *
 * Clerk's card chrome is stripped in `app/globals.css` under `.auth-clerk`,
 * because the `appearance.elements` prop is not honoured by `@clerk/ui` v1 —
 * its widget was rendering at its intrinsic 329px and sitting left of centre
 * inside this panel instead of filling it.
 *
 * The "encrypted session handoff" caption sits *below* the card rather than in
 * it: Clerk's footer already draws a rule above "Don't have an account", and a
 * rule above the Clerk badge, so a third one inside the card stacked three
 * hairlines within 140px.
 */

type Highlight = { label: string; title: string; body: string };

const HIGHLIGHTS: Highlight[] = [
  {
    label: "01 / threads",
    title: "Every conversation, kept",
    body: "Threads persist with full context, searchable and resumable.",
  },
  {
    label: "02 / memory",
    title: "Remembers what matters",
    body: "Durable facts and preferences carried across sessions.",
  },
  {
    label: "03 / tools",
    title: "Answers that do the work",
    body: "Live product, weather, and market data rendered inline.",
  },
];

export function AuthScreenShell({
  children,
  eyebrow,
  headline,
  tagline,
  panelHint,
}: Readonly<{
  children: ReactNode;
  eyebrow: string;
  headline: string;
  tagline: string;
  panelHint: string;
}>) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-surface-sunken text-fg-strong">
      {/* Ember bloom from the top, a low amber floor, and a fine technical grid. */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_50%_at_50%_-10%,var(--bloom-ember),transparent_62%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_88%_18%,var(--bloom-crimson),transparent_60%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_10%_100%,var(--bloom-amber),transparent_58%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.22] [background-image:linear-gradient(to_right,var(--hairline-subtle)_1px,transparent_1px),linear-gradient(to_bottom,var(--glass-fill)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(ellipse_80%_70%_at_50%_40%,black,transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_55%,var(--vignette-deep)_100%)]"
        aria-hidden
      />

      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl items-center justify-center px-5 py-12 sm:px-8">
        <div className="grid w-full items-center gap-14 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-20">
          {/* Left: the product argument. Hidden below lg so the panel stays centred. */}
          <div className="auth-reveal hidden lg:flex lg:flex-col lg:gap-10">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl border border-hairline brand-glass">
                <Image
                  src={BRAND_LOGO_SRC}
                  className="size-7 object-contain"
                  width={28}
                  height={28}
                  alt=""
                  priority
                />
              </div>
              <span className="text-base font-semibold tracking-[-0.02em] text-fg-bright">
                AIChatWave
              </span>
            </div>

            <div className="space-y-5">
              <h1 className="max-w-[15ch] text-balance text-5xl font-semibold leading-[1.03] tracking-[-0.05em] text-fg-bright">
                {headline}
              </h1>
              <p className="max-w-[38ch] text-lg leading-8 text-fg-soft">{tagline}</p>
            </div>

            {/* The rule is the list's spine; each marker is centred on it. */}
            <ul className="space-y-6 border-l border-hairline pl-6">
              {HIGHLIGHTS.map((item) => (
                <li key={item.label} className="relative">
                  <span
                    className="absolute -left-[26px] top-1 size-1.5 rounded-full bg-brand/70 shadow-glow-ring"
                    aria-hidden
                  />
                  <p className="font-mono text-2xs uppercase leading-4 tracking-[0.28em] text-brand-text-strong/55">
                    {item.label}
                  </p>
                  <p className="mt-2 text-base font-medium leading-5 text-fg-strong">
                    {item.title}
                  </p>
                  <p className="mt-1.5 max-w-[42ch] text-sm leading-6 text-fg-muted">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: the auth panel. `--auth-gutter` is the single horizontal
              rail every child of the card lines up on, Clerk's included. */}
          <div className="auth-reveal auth-reveal-delayed mx-auto w-full max-w-[440px]">
            <div className="relative overflow-hidden rounded-4xl border border-hairline bg-surface-sunken/55 shadow-elevation-xl inset-shadow-highlight backdrop-blur-glass-heavy [--auth-gutter:1.5rem] supports-[backdrop-filter]:bg-surface-sunken/40 sm:[--auth-gutter:2rem]">
              <div
                className="pointer-events-none absolute inset-x-10 top-0 h-px brand-rule"
                aria-hidden
              />

              <div className="flex flex-col items-center gap-4 px-[var(--auth-gutter)] pt-9 text-center">
                <div className="flex size-14 items-center justify-center rounded-2xl border border-hairline brand-glass shadow-glow-md lg:hidden">
                  <Image
                    src={BRAND_LOGO_SRC}
                    className="size-9 object-contain"
                    width={36}
                    height={36}
                    alt="AIChatWave"
                    priority
                  />
                </div>

                <span className="flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.3em] text-brand-text-strong/65">
                  <span className="size-1 rounded-full bg-brand/80 shadow-glow-ring" aria-hidden />
                  {eyebrow}
                </span>

                {/* The left column carries the headline on desktop; on small
                    screens it is hidden, so the panel takes over that job. */}
                <h2 className="text-balance text-2xl font-semibold leading-tight tracking-[-0.035em] text-fg-bright lg:hidden">
                  {headline}
                </h2>

                <p className="text-balance text-sm leading-6 text-fg-muted">{panelHint}</p>
              </div>

              {/* Clerk's widget. De-chromed and stretched by `.auth-clerk` rules;
                  it supplies its own footer, which is why the card ends here. */}
              <div className="auth-clerk px-[var(--auth-gutter)] pb-7 pt-7">{children}</div>
            </div>

            {/* Caption below the card, so the card itself ends on Clerk's rule
                rather than a third stacked hairline. */}
            <div className="mt-6 flex items-center gap-4" aria-hidden>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent to-glass-strong" />
              <p className="font-mono text-2xs uppercase tracking-[0.24em] text-fg-muted">
                Encrypted session handoff
              </p>
              <span className="h-px flex-1 bg-gradient-to-l from-transparent to-glass-strong" />
            </div>

            <p className="mt-5 text-center text-sm leading-6 text-fg-muted lg:hidden">
              Threads, long-term memory, and tool-powered answers.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
