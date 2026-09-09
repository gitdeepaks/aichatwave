import Image from "next/image";
import type { ReactNode } from "react";
import { BRAND_LOGO_SRC } from "@/lib/brand";

/**
 * The branded frame around Clerk's sign-in and sign-up widgets.
 *
 * Layout is a two-column split from `lg` up: the product argument on the left,
 * the auth panel on the right. Below `lg` it collapses to the panel alone,
 * centred. The earlier version put a single narrow card in the middle of a very
 * wide dark field, which read as off-centre and empty; giving the page a second
 * column turns that empty space into structure.
 *
 * Clerk's own card chrome is stripped in `app/globals.css` under `.auth-clerk`,
 * because the `appearance.elements` prop is not honoured by `@clerk/ui` v1 —
 * its widget was rendering at its intrinsic 329px and sitting left of centre
 * inside this panel instead of filling it.
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
    <div className="relative min-h-dvh overflow-hidden bg-[#08080a] text-zinc-100">
      {/* Ember bloom from the top, a low amber floor, and a fine technical grid. */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_50%_at_50%_-10%,rgba(249,115,22,0.28),transparent_62%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_88%_18%,rgba(220,38,38,0.14),transparent_60%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_10%_100%,rgba(251,191,36,0.10),transparent_58%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.22] [background-image:linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(ellipse_80%_70%_at_50%_40%,black,transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_55%,rgba(0,0,0,0.65)_100%)]"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-6xl items-center justify-center px-5 py-12 sm:px-8">
        <div className="grid w-full items-center gap-14 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-20">
          {/* Left: the product argument. Hidden below lg so the panel stays centred. */}
          <section className="hidden lg:flex lg:flex-col lg:gap-10 auth-reveal">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-orange-300/20 via-white/[0.06] to-red-500/10">
                <Image
                  src={BRAND_LOGO_SRC}
                  className="size-7 object-contain"
                  width={512}
                  height={285}
                  alt=""
                  priority
                  unoptimized
                />
              </div>
              <span className="text-[15px] font-semibold tracking-[-0.02em] text-white">
                AIChatWave
              </span>
            </div>

            <div className="space-y-5">
              <h1 className="max-w-[15ch] text-balance text-[3.25rem] font-semibold leading-[1.03] tracking-[-0.05em] text-white">
                {headline}
              </h1>
              <p className="max-w-[38ch] text-[17px] leading-8 text-zinc-400">{tagline}</p>
            </div>

            <ul className="space-y-6 border-l border-white/[0.07] pl-6">
              {HIGHLIGHTS.map((item) => (
                <li key={item.label} className="relative">
                  <span
                    className="absolute -left-[25px] top-2 size-1.5 rounded-full bg-orange-400/70 shadow-[0_0_14px_rgba(251,146,60,0.9)]"
                    aria-hidden
                  />
                  <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-orange-200/55">
                    {item.label}
                  </p>
                  <p className="mt-1.5 text-[15px] font-medium text-zinc-100">{item.title}</p>
                  <p className="mt-1 max-w-[42ch] text-[14px] leading-6 text-zinc-500">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* Right: the auth panel. */}
          <section className="mx-auto w-full max-w-[460px] auth-reveal auth-reveal-delayed">
            <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-zinc-950/55 shadow-[0_40px_120px_-48px_rgba(0,0,0,1),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-2xl supports-[backdrop-filter]:bg-zinc-950/40">
              <div
                className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-orange-200/50 to-transparent"
                aria-hidden
              />

              <div className="flex flex-col items-center gap-4 px-7 pt-9 text-center sm:px-9">
                <div className="flex size-14 items-center justify-center rounded-[1.2rem] border border-white/10 bg-gradient-to-br from-orange-300/20 via-white/[0.06] to-red-500/10 shadow-[0_18px_44px_-26px_rgba(251,146,60,0.85)] lg:hidden">
                  <Image
                    src={BRAND_LOGO_SRC}
                    className="size-9 object-contain"
                    width={512}
                    height={285}
                    alt="AIChatWave"
                    priority
                    unoptimized
                  />
                </div>

                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-orange-200/65">
                  {eyebrow}
                </span>

                {/* The left column carries the headline on desktop; on small
                    screens it is hidden, so the panel takes over that job. */}
                <h2 className="text-balance text-[1.55rem] font-semibold leading-tight tracking-[-0.035em] text-white lg:hidden">
                  {headline}
                </h2>

                <p className="max-w-[30ch] text-[14px] leading-6 text-zinc-500">{panelHint}</p>
              </div>

              {/* Clerk's widget. De-chromed and stretched by `.auth-clerk` rules. */}
              <div className="auth-clerk px-5 pb-2 pt-7 sm:px-7">{children}</div>

              <div className="px-7 pb-8 sm:px-9">
                <p className="border-t border-white/[0.06] pt-5 text-center font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-600">
                  Encrypted session handoff
                </p>
              </div>
            </div>

            <p className="mt-6 text-center text-[13px] leading-6 text-zinc-600 lg:hidden">
              Threads, long-term memory, and tool-powered answers.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
