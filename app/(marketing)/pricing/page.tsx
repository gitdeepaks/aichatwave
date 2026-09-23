import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { connection } from "next/server";

import { PlanCards } from "@/components/marketing/plan-cards";
import { Container, Eyebrow, Hairline } from "@/components/marketing/marketing-shell";
import { JsonLd } from "@/components/seo/json-ld";
import { MODEL_IDS, getModelPresentation, getModelPricing } from "@/lib/ai/model-registry";
import { appUrl } from "@/lib/env";
import { FAQ } from "@/lib/marketing/content";
import { buildPlanCards } from "@/lib/marketing/plans";
import { ROUTES } from "@/lib/routes";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
} from "@/lib/seo/json-ld";
import { getProPlanPrice } from "@/server/billing/pricing-service";
import { SITE_NAME } from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Two plans. Free gives you GPT-5 mini and nano with a real monthly allowance; Pro adds Gemini 3.1 Pro and Claude Sonnet 4. No card to start.",
  alternates: { canonical: ROUTES.pricing },
  openGraph: {
    title: `Pricing · ${SITE_NAME}`,
    description:
      "Free and Pro, side by side. Every limit on this page is the limit the server enforces.",
    url: ROUTES.pricing,
  },
};

/**
 * `/pricing`.
 *
 * Dynamic for the same reason the landing page is — the CSP nonce cannot be
 * stamped onto a prerendered page — and, here, for a second reason: the Pro
 * price is read from Polar, so the page is only as current as its last render.
 * `getProPlanPrice` caches for an hour in process, so this costs one upstream
 * call per instance per hour rather than one per visit.
 */
export default async function PricingPage() {
  await connection();

  const origin = appUrl();
  // `auth()` on a public page returns a null user id when signed out, which is
  // exactly the question the plan buttons need answered. Resolving it here
  // rather than in the client component is what keeps the primary call to
  // action from changing under the visitor a beat after paint.
  const [{ userId }, proPrice] = await Promise.all([auth(), getProPlanPrice()]);
  const plans = buildPlanCards({ proPrice });

  return (
    <>
      <JsonLd
        documents={[
          organizationJsonLd(origin),
          softwareApplicationJsonLd({ origin, plans }),
          breadcrumbJsonLd({
            origin,
            trail: [
              { name: "Home", path: ROUTES.home },
              { name: "Pricing", path: ROUTES.pricing },
            ],
          }),
          faqJsonLd({ entries: FAQ }),
        ]}
      />

      <section className="pb-16 pt-20 sm:pt-24">
        <Container className="flex flex-col gap-10">
          <div className="max-w-[44ch]">
            <Eyebrow>Pricing</Eyebrow>
            <h1 className="mt-5 text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.045em] text-fg-bright sm:text-6xl">
              Two plans. No surprises in either.
            </h1>
            <p className="mt-5 text-base leading-7 text-fg-soft">
              Every number below is read from the same code that enforces it — the message allowance
              from the rate limiter, the model list from the registry, the price from the product
              checkout charges.
            </p>
          </div>

          <PlanCards plans={plans} isSignedIn={userId !== null} />
        </Container>
      </section>

      <TokenPricing />
      <PricingFaq />
    </>
  );
}

/**
 * The provider list prices, shown rather than hidden.
 *
 * Unusual for a subscription product, and deliberate: this app shows per-message
 * cost in the UI and an operations dashboard that totals spend, so the numbers
 * are already visible to the people who look. Publishing the table they come
 * from is the consistent position, and it is the one piece of information that
 * explains why two models sit on different plans.
 */
function TokenPricing() {
  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <section className="pb-24 sm:pb-28" aria-labelledby="token-pricing-heading">
      <Container>
        <Hairline className="mb-14" />
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-20">
          <div>
            <Eyebrow>Underlying cost</Eyebrow>
            <h2
              id="token-pricing-heading"
              className="mt-5 text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.04em] text-fg-bright"
            >
              What each model costs to run.
            </h2>
            <p className="mt-5 max-w-[42ch] text-sm leading-7 text-fg-muted">
              Provider list prices in US dollars per million tokens. Your plan covers these — the
              table is here because it is the honest answer to why Claude and Gemini are on Pro.
            </p>
          </div>

          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Provider list price per million tokens, by model</caption>
            <thead>
              <tr className="border-b border-hairline">
                <th
                  scope="col"
                  className="pb-3 font-mono text-2xs font-normal uppercase tracking-[0.22em] text-fg-muted"
                >
                  Model
                </th>
                <th
                  scope="col"
                  className="pb-3 text-right font-mono text-2xs font-normal uppercase tracking-[0.22em] text-fg-muted"
                >
                  Input / 1M
                </th>
                <th
                  scope="col"
                  className="pb-3 text-right font-mono text-2xs font-normal uppercase tracking-[0.22em] text-fg-muted"
                >
                  Output / 1M
                </th>
              </tr>
            </thead>
            <tbody>
              {MODEL_IDS.map((modelId) => {
                const presentation = getModelPresentation(modelId);
                const pricing = getModelPricing(modelId);
                return (
                  <tr key={modelId} className="border-b border-hairline-subtle">
                    <th scope="row" className="py-4 pr-4 text-sm font-medium text-fg">
                      {presentation.name}
                      <span className="ml-2 font-mono text-2xs font-normal uppercase tracking-[0.16em] text-fg-muted">
                        {presentation.vendor}
                      </span>
                    </th>
                    <td className="py-4 text-right text-sm tabular-nums text-fg-soft">
                      {currency.format(pricing.inputPerMillionUsd)}
                    </td>
                    <td className="py-4 text-right text-sm tabular-nums text-fg-soft">
                      {currency.format(pricing.outputPerMillionUsd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Container>
    </section>
  );
}

function PricingFaq() {
  return (
    <section className="pb-24 sm:pb-28" aria-labelledby="pricing-faq-heading">
      <Container>
        <Hairline className="mb-14" />
        <h2
          id="pricing-faq-heading"
          className="text-balance text-3xl font-semibold leading-[1.1] tracking-[-0.04em] text-fg-bright"
        >
          Questions about the plans.
        </h2>
        <dl className="mt-10 grid gap-x-12 sm:grid-cols-2">
          {FAQ.map((entry) => (
            <div key={entry.question} className="border-t border-hairline-subtle py-6">
              <dt className="text-base font-medium leading-6 text-fg-strong">{entry.question}</dt>
              <dd className="mt-2.5 text-sm leading-7 text-fg-muted">{entry.answer}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
