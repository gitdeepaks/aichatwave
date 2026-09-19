import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight } from "lucide-react";

import {
  Container,
  Eyebrow,
  Hairline,
  panelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/marketing/marketing-shell";
import { JsonLd } from "@/components/seo/json-ld";
import {
  MODEL_IDS,
  MODEL_REGISTRY,
  getModelPresentation,
  modelIdsInTier,
} from "@/lib/ai/model-registry";
import { appUrl } from "@/lib/env";
import { CLOSING_CTA, FAQ, FEATURES, HERO, TRUST_POINTS } from "@/lib/marketing/content";
import { buildPlanCards } from "@/lib/marketing/plans";
import { ROUTES } from "@/lib/routes";
import {
  faqJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from "@/lib/seo/json-ld";
import { SITE_DESCRIPTION, SITE_TAGLINE } from "@/lib/seo/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  // The root layout's template appends the site name; the landing page is the
  // one route that carries the full proposition in the title instead.
  title: { absolute: `AIChatWave — ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: ROUTES.home },
};

/**
 * The public landing page.
 *
 * ## Why it renders dynamically
 *
 * `connection()` opts this page out of static generation, and it is not
 * optional. The proxy issues a per-request CSP nonce and `script-src` carries
 * `'strict-dynamic'`, which makes host sources — including `'self'` — inert:
 * only a nonce authorizes a script. A statically prerendered page is built
 * before any request exists, so Next has no nonce to stamp on its bundle tags
 * and every script on it is blocked. That is not theoretical; it is what the
 * prerendered `/_not-found` page does today.
 *
 * The cost is one server render per visit for a page with no per-user content,
 * which is a real cost and the right trade: the alternative is a landing page
 * whose JavaScript never runs.
 */
export default async function LandingPage() {
  await connection();

  const origin = appUrl();
  // Free-tier only. The Pro price lives on `/pricing`, which is where it is
  // worth a Polar round trip; the landing page stays independent of an
  // upstream that has been down before.
  const plans = buildPlanCards({ proPrice: null });

  return (
    <>
      <JsonLd
        documents={[
          organizationJsonLd(origin),
          websiteJsonLd(origin),
          softwareApplicationJsonLd({ origin, plans }),
          faqJsonLd({ entries: FAQ }),
        ]}
      />

      <Hero />
      <TrustStrip />
      <Features />
      <ModelLineup />
      <Faq />
      <ClosingCta />
    </>
  );
}

function Hero() {
  return (
    <section className="relative pb-24 pt-20 sm:pt-28">
      <Container>
        <div className="grid items-start gap-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16">
          <div className="flex flex-col gap-7">
            <Eyebrow>{HERO.eyebrow}</Eyebrow>

            <h1 className="max-w-[16ch] text-balance text-[2.75rem] font-semibold leading-[1.04] tracking-[-0.045em] text-white sm:text-[3.5rem] lg:text-[4rem]">
              {HERO.headline}
            </h1>

            <p className="max-w-[52ch] text-[17px] leading-8 text-zinc-300">{HERO.subhead}</p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link href={HERO.primaryCta.href} className={primaryButtonClass}>
                {HERO.primaryCta.label}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href={HERO.secondaryCta.href} className={secondaryButtonClass}>
                {HERO.secondaryCta.label}
              </Link>
            </div>

            <p className="text-[13px] leading-6 text-zinc-400">{HERO.reassurance}</p>
          </div>

          {/* The right column is the product's own instrument panel, drawn
              rather than screenshotted: a screenshot of a dark glass UI at this
              size is unreadable, and one that goes stale is worse than none. */}
          <ModelPanel />
        </div>
      </Container>
    </section>
  );
}

/**
 * A static rendering of the model picker.
 *
 * Reads the registry, so it cannot show a model the product does not serve —
 * the failure mode of every hand-drawn marketing mock.
 */
function ModelPanel() {
  return (
    <div className={cn(panelClass, "relative overflow-hidden p-1.5")}>
      <div
        className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-orange-200/50 to-transparent"
        aria-hidden
      />
      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-zinc-400">
          Model
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-zinc-400">⌘K</span>
      </div>
      <Hairline />
      <ul className="flex flex-col gap-1 p-1.5">
        {MODEL_IDS.map((modelId) => {
          const model = getModelPresentation(modelId);
          const isPro = MODEL_REGISTRY[modelId].tier === "subscription";
          return (
            <li
              key={modelId}
              className="flex items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-white/[0.04] motion-reduce:transition-none"
            >
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  isPro ? "bg-zinc-700" : "bg-orange-400/80 shadow-[0_0_10px_rgba(251,146,60,0.8)]",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="text-[14px] font-medium text-zinc-100">{model.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                    {model.vendor}
                  </span>
                </span>
                <span className="mt-1 block text-[13px] leading-5 text-zinc-400">
                  {model.blurb}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em]",
                  isPro
                    ? "border-white/10 text-zinc-400"
                    : "border-orange-300/25 text-orange-200/85",
                )}
              >
                {isPro ? "Pro" : "Free"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TrustStrip() {
  return (
    <section aria-label="What the system guarantees">
      <Hairline />
      <Container>
        <ul className="grid gap-x-8 gap-y-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-2.5">
              <span
                className="mt-[7px] size-1 shrink-0 rounded-full bg-orange-400/70"
                aria-hidden
              />
              <span className="text-[13px] leading-6 text-zinc-400">{point}</span>
            </li>
          ))}
        </ul>
      </Container>
      <Hairline />
    </section>
  );
}

function Features() {
  return (
    <section className="py-24 sm:py-32" aria-labelledby="features-heading">
      <Container>
        <div className="max-w-[46ch]">
          <Eyebrow>What you get</Eyebrow>
          <h2
            id="features-heading"
            className="mt-5 text-balance text-[2rem] font-semibold leading-[1.1] tracking-[-0.04em] text-white sm:text-[2.5rem]"
          >
            Built like a tool, not like a chat box.
          </h2>
        </div>

        {/* The rule between columns is the composition. Cards would box six
            equal things into six equal rectangles; a shared spine lets them
            read as one list that happens to wrap. */}
        <ul className="mt-14 grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.index} className="border-l border-white/[0.07] pl-5">
              <p className="font-mono text-[10px] uppercase leading-4 tracking-[0.26em] text-orange-200/55">
                {feature.index}
              </p>
              <h3 className="mt-3 text-[17px] font-medium leading-6 tracking-[-0.01em] text-zinc-100">
                {feature.title}
              </h3>
              <p className="mt-2.5 text-[14px] leading-6 text-zinc-400">{feature.body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function ModelLineup() {
  const freeModels = modelIdsInTier("free");
  const proModels = modelIdsInTier("subscription");

  return (
    <section className="pb-24 sm:pb-32" aria-labelledby="models-heading">
      <Container>
        <Hairline className="mb-14" />
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
          <div>
            <Eyebrow>Model lineup</Eyebrow>
            <h2
              id="models-heading"
              className="mt-5 text-balance text-[2rem] font-semibold leading-[1.1] tracking-[-0.04em] text-white sm:text-[2.4rem]"
            >
              Pick the model per question, not per subscription.
            </h2>
            <p className="mt-5 max-w-[44ch] text-[15px] leading-7 text-zinc-400">
              Every model reads images and PDFs. When a provider goes down, the turn falls back to a
              healthy one at the same tier or lower — never to a paid model you did not pay for.
            </p>
            <Link
              href={ROUTES.pricing}
              className="mt-7 inline-flex items-center gap-1.5 rounded-sm text-[14px] font-medium text-orange-200 transition-colors hover:text-orange-100 motion-reduce:transition-none"
            >
              Compare the plans
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>

          <div className="flex flex-col gap-10">
            <ModelTierList heading="On every plan" modelIds={freeModels} />
            <ModelTierList heading="Added with Pro" modelIds={proModels} />
          </div>
        </div>
      </Container>
    </section>
  );
}

function ModelTierList({
  heading,
  modelIds,
}: Readonly<{ heading: string; modelIds: readonly (typeof MODEL_IDS)[number][] }>) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-zinc-400">{heading}</p>
      <ul className="mt-4 flex flex-col">
        {modelIds.map((modelId) => {
          const model = getModelPresentation(modelId);
          return (
            <li
              key={modelId}
              className="flex flex-col gap-1 border-t border-white/[0.06] py-4 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <span className="w-40 shrink-0 text-[15px] font-medium text-zinc-100">
                {model.name}
              </span>
              <span className="text-[14px] leading-6 text-zinc-400">{model.blurb}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Faq() {
  return (
    <section className="pb-24 sm:pb-32" aria-labelledby="faq-heading">
      <Container>
        <Hairline className="mb-14" />
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-20">
          <div>
            <Eyebrow>Before you sign up</Eyebrow>
            <h2
              id="faq-heading"
              className="mt-5 text-balance text-[2rem] font-semibold leading-[1.1] tracking-[-0.04em] text-white sm:text-[2.4rem]"
            >
              The questions worth asking.
            </h2>
          </div>

          {/* A definition list, not a set of collapsibles. Four short answers
              are faster to read than to open, and every one of them is also a
              structured-data answer that has to match what is visible. */}
          <dl className="flex flex-col">
            {FAQ.map((entry) => (
              <div key={entry.question} className="border-t border-white/[0.06] py-6">
                <dt className="text-[16px] font-medium leading-6 text-zinc-100">
                  {entry.question}
                </dt>
                <dd className="mt-2.5 max-w-[62ch] text-[14px] leading-7 text-zinc-400">
                  {entry.answer}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="pb-8">
      <Container>
        <div className={cn(panelClass, "relative overflow-hidden px-8 py-14 text-center sm:px-14")}>
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_100%_at_50%_0%,rgba(249,115,22,0.16),transparent_70%)]"
            aria-hidden
          />
          <div className="relative flex flex-col items-center gap-5">
            <h2 className="text-balance text-[2rem] font-semibold leading-[1.1] tracking-[-0.04em] text-white sm:text-[2.5rem]">
              {CLOSING_CTA.headline}
            </h2>
            <p className="max-w-[48ch] text-[15px] leading-7 text-zinc-300">{CLOSING_CTA.body}</p>
            <Link href={CLOSING_CTA.cta.href} className={cn(primaryButtonClass, "mt-2")}>
              {CLOSING_CTA.cta.label}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}
