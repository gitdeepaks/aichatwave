/**
 * The words on the public pages.
 *
 * Client-safe: data only.
 *
 * Copy lives here, apart from the components that render it, for one reason:
 * the FAQ is rendered twice — once as visible prose and once as `FAQPage`
 * structured data — and Google treats a structured answer that differs from
 * the visible one as a policy violation. Two literals in two files is how that
 * happens. One array read by both is how it cannot.
 *
 * Numbers are deliberately absent. Anything countable — message limits, model
 * counts, prices — is derived in `lib/marketing/plans.ts` from the modules the
 * server enforces with, so nothing here can promise a limit the app does not
 * honour.
 */

import { ROUTES } from "@/lib/routes";

export type MarketingFeature = {
  /** `01 / threads` — the mono index label the product already uses on auth. */
  index: string;
  title: string;
  body: string;
};

export const HERO = {
  eyebrow: "Multi-model AI workspace",
  headline: "Three frontier models. One conversation that remembers.",
  subhead:
    "Switch between GPT-5, Gemini and Claude mid-thread without losing context. Every conversation is stored, searchable and resumable — including the answer that was still streaming when you closed the tab.",
  primaryCta: { label: "Start free", href: ROUTES.signUp },
  secondaryCta: { label: "See pricing", href: ROUTES.pricing },
  /** Shown under the CTAs. Every claim here is enforced somewhere in the code. */
  reassurance:
    "No card to start · Sign in with Google, GitHub or LinkedIn · Delete everything in one click",
} as const;

export const FEATURES: readonly MarketingFeature[] = [
  {
    index: "01 / threads",
    title: "Conversations that survive the tab",
    body: "A generation keeps running when your connection drops. Reload and the answer is still arriving — not restarted, not lost, the same stream reattached.",
  },
  {
    index: "02 / memory",
    title: "Memory you switch on yourself",
    body: "Durable facts and preferences carried between conversations, stored per account and searchable by meaning. Off until you say otherwise, and erasable one fact at a time.",
  },
  {
    index: "03 / models",
    title: "Change model without changing thread",
    body: "The picker swaps the model, not the conversation. Ask a cheap model first, escalate to a careful one when the answer matters, and keep every earlier turn in context.",
  },
  {
    index: "04 / tools",
    title: "Answers that go and look",
    body: "Live product, weather, market and news data fetched mid-answer and rendered as real cards rather than a paragraph describing a table.",
  },
  {
    index: "05 / attachments",
    title: "Images and PDFs, read properly",
    body: "Attach a document and the composer checks the selected model can actually read it before the upload starts — not after, with an error.",
  },
  {
    index: "06 / ownership",
    title: "Your data, exportable and deletable",
    body: "Export any conversation as JSON or Markdown. Delete your account and every thread, message, attachment and memory goes with it, verifiably.",
  },
];

/**
 * The four questions a visitor actually has before signing up.
 *
 * Answers are short because they are also the structured-data answers, and a
 * `FAQPage` answer that runs to a paragraph is one Google truncates.
 */
export const FAQ: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: "Do I need a credit card to try it?",
    answer:
      "No. The free plan needs only a Google, GitHub or LinkedIn account, and it is a monthly allowance rather than a trial that expires.",
  },
  {
    question: "Which models can I use?",
    answer:
      "GPT-5 mini and GPT-5 nano on the free plan; Gemini 3.1 Pro and Claude Sonnet 4 are added on Pro. You can switch between them inside a single conversation.",
  },
  {
    question: "What does the assistant remember about me?",
    answer:
      "Nothing until you turn long-term memory on. Once enabled it stores short durable facts you can read, search and delete individually from the Memory Center.",
  },
  {
    question: "Can I get my conversations out?",
    answer:
      "Yes. Every thread exports as JSON or Markdown from the sidebar, and deleting your account removes every thread, message, attachment and memory.",
  },
];

/** The proof strip under the hero. Each item is a property of the running system. */
export const TRUST_POINTS: readonly string[] = [
  "Streams resume after a reload",
  "Per-user data isolation on every query",
  "Social sign-in only — no password to leak",
  "Usage and spend visible to you, not just to us",
];

export const CLOSING_CTA = {
  headline: "Open a thread and see.",
  body: "The free plan is a month of real work, not a demo. Nothing to cancel if you stop.",
  cta: { label: "Start free", href: ROUTES.signUp },
} as const;
