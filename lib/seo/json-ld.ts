/**
 * Structured data for the public pages.
 *
 * Client-safe and pure: each builder takes the deployment origin and returns a
 * plain JSON object. Nothing here renders — `components/seo/json-ld.tsx` does
 * that — which is what makes the graph assertable in a unit test rather than
 * only in Google's Rich Results tool.
 *
 * ## Why hand-built rather than `schema-dts`
 *
 * `schema-dts` types the whole of schema.org, and its `WithContext<T>` unions
 * resolve slowly enough to be felt in `tsc`. Three entity shapes are used here
 * and they are pinned to `JsonValue`, so a field with a value that cannot be
 * serialized is still a compile error — which is the property that actually
 * mattered.
 *
 * ## What is claimed, and what is not
 *
 * Only facts this deployment can stand behind. No `aggregateRating` and no
 * `review`: inventing either is the fastest route to a manual action, and
 * there is no review corpus to draw from. `Offer` prices come from Polar, so
 * an unreadable price omits the offer rather than quoting a number nobody
 * agreed to.
 */

import type { JsonObject } from "@/lib/json";
import { formatPlanPrice, type PlanCard } from "@/lib/marketing/plans";
import { absoluteUrl, ROUTES } from "@/lib/routes";
import { OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/seo/site";

const SCHEMA_CONTEXT = "https://schema.org";

/** Stable `@id`s, so the three documents below describe one entity rather than three. */
function organizationId(origin: string): string {
  return `${absoluteUrl(origin, ROUTES.home)}#organization`;
}

function websiteId(origin: string): string {
  return `${absoluteUrl(origin, ROUTES.home)}#website`;
}

export function organizationJsonLd(origin: string): JsonObject {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "Organization",
    "@id": organizationId(origin),
    name: SITE_NAME,
    url: absoluteUrl(origin, ROUTES.home),
    logo: absoluteUrl(origin, "/brand-logo.png"),
    description: SITE_DESCRIPTION,
  };
}

export function websiteJsonLd(origin: string): JsonObject {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "WebSite",
    "@id": websiteId(origin),
    name: SITE_NAME,
    alternateName: SITE_TAGLINE,
    url: absoluteUrl(origin, ROUTES.home),
    publisher: { "@id": organizationId(origin) },
  };
}

/**
 * The product itself.
 *
 * `SoftwareApplication` with `applicationCategory: "BusinessApplication"` is
 * what Google's own documentation uses for a hosted web app; `WebApplication`
 * is a subtype it understands less well.
 */
export function softwareApplicationJsonLd(params: {
  origin: string;
  plans: readonly PlanCard[];
}): JsonObject {
  const offers = params.plans.flatMap((plan) => {
    if (plan.price === null) return [];
    return [
      {
        "@type": "Offer",
        name: plan.name,
        price: (plan.price.amountMinor / 100).toFixed(2),
        priceCurrency: plan.price.currency,
        url: absoluteUrl(params.origin, ROUTES.pricing),
        availability: "https://schema.org/InStock",
      },
    ];
  });

  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: absoluteUrl(params.origin, ROUTES.home),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any modern web browser",
    image: absoluteUrl(params.origin, OG_IMAGE.path),
    publisher: { "@id": organizationId(params.origin) },
    ...(offers.length > 0 ? { offers } : {}),
  };
}

/**
 * The pricing page's breadcrumb.
 *
 * Two levels is not much of a trail, but it is what tells Google the page's
 * place in the site rather than leaving it to infer one from the URL.
 */
export function breadcrumbJsonLd(params: {
  origin: string;
  trail: ReadonlyArray<{ name: string; path: string }>;
}): JsonObject {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: params.trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(params.origin, crumb.path),
    })),
  };
}

/**
 * The questions the landing page answers, as a `FAQPage`.
 *
 * Kept beside the copy it mirrors — a structured answer that has drifted from
 * the visible one is a policy violation, not just an inaccuracy.
 */
export function faqJsonLd(params: {
  entries: ReadonlyArray<{ question: string; answer: string }>;
}): JsonObject {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "FAQPage",
    mainEntity: params.entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

/**
 * Serializes a graph for an inline `<script type="application/ld+json">`.
 *
 * The `<` escape is the whole point: a value containing `</script>` would
 * otherwise close the tag and let everything after it parse as markup. None of
 * the inputs here are user-supplied today, and this is not the place to depend
 * on that staying true.
 */
export function serializeJsonLd(documents: readonly JsonObject[]): string {
  const payload = documents.length === 1 ? documents[0] : documents;
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}

/** Convenience for the pricing-page price string, kept beside the offer builder. */
export function offerSummary(plan: PlanCard): string {
  return plan.price === null ? "See price at checkout" : formatPlanPrice(plan.price);
}
