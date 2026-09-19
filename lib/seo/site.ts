/**
 * The product's identity as search engines and social cards see it.
 *
 * Client-safe: strings and pure builders. The origin is passed in rather than
 * read from `lib/env.ts` so this module stays importable from anywhere and
 * testable without a process environment.
 *
 * One title and one description, declared once. `app/layout.tsx` used to hold
 * them inline and every new route would have restated them — which is how a
 * site ends up with three slightly different descriptions of itself and none
 * of them current.
 */

export const SITE_NAME = "AIChatWave";

export const SITE_TAGLINE = "Chat for coders who want to work with AI";

/**
 * The default description, used on `/` and as the fallback everywhere else.
 *
 * Under 160 characters on purpose: past that, Google truncates and the last
 * clause is wasted.
 */
export const SITE_DESCRIPTION =
  "One workspace for GPT-5, Gemini and Claude. Threads that keep their context, memory you control, and tools that fetch real data mid-answer.";

export const SITE_KEYWORDS = [
  "AI chat",
  "GPT-5",
  "Claude",
  "Gemini",
  "multi-model chat",
  "AI workspace for developers",
  "long-term memory AI",
];

/** The social card. 1200×630 is the size every platform crops from. */
export const OG_IMAGE = {
  path: "/og.jpg",
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
} as const;

export const TWITTER_HANDLE = "@aichatwave";

/**
 * `Page title · AIChatWave`, with the bare site name left alone.
 *
 * A middle dot rather than an em dash because it survives truncation better in
 * a 60-character SERP title.
 */
export function pageTitle(title: string): string {
  return title === SITE_NAME ? SITE_NAME : `${title} · ${SITE_NAME}`;
}
