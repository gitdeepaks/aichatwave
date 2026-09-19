/**
 * The two plan cards on `/pricing`, derived rather than written.
 *
 * Client-safe: pure functions over `PLAN_LIMITS` and `MODEL_REGISTRY`, no env
 * access and no server imports.
 *
 * Every number on the page comes from the module the server enforces it with.
 * A marketing page that states a limit in prose is a page that will one day be
 * wrong — `PLAN_LIMITS.free.monthlyMessages` moves and the copy does not — and
 * "the site said 500" is not an argument anyone wins. Raising a limit here is
 * a one-line change in `lib/billing/plan-policy.ts`, and the page follows.
 *
 * The price is the one figure this module does **not** invent. Polar is the
 * billing record, so the amount is passed in from
 * `server/billing/pricing-service.ts`, which reads it from the product that
 * checkout actually charges. `null` is a real outcome and renders as a link to
 * checkout rather than a guess.
 */

import {
  MODEL_REGISTRY,
  modelIdsInTier,
  type ModelId,
  type ModelTier,
} from "@/lib/ai/model-registry";
import { PLAN_LIMITS, type PlanId } from "@/lib/billing/plan-policy";

/**
 * A recurring price, in the currency's minor units.
 *
 * Minor units because that is what Polar returns and what avoids the floating
 * point rounding that turns $19.99 into $19.989999999999998 somewhere between
 * the API and the page.
 */
export type PlanPrice = {
  amountMinor: number;
  /** ISO 4217, upper case. */
  currency: string;
  interval: "month" | "year";
};

export type PlanModelSummary = {
  id: ModelId;
  name: string;
  vendor: string;
  blurb: string;
};

export type PlanCard = {
  id: PlanId;
  name: string;
  tagline: string;
  /** Null when the price could not be read from Polar; the card then defers to checkout. */
  price: PlanPrice | null;
  features: readonly string[];
  models: readonly PlanModelSummary[];
  /** The card the eye should land on. Exactly one card carries it. */
  featured: boolean;
};

/** Which model tier a plan unlocks. The free plan sees only free-tier models. */
const PLAN_MODEL_TIERS: Record<PlanId, readonly ModelTier[]> = {
  free: ["free"],
  pro: ["free", "subscription"],
};

function modelsForPlan(planId: PlanId): PlanModelSummary[] {
  return PLAN_MODEL_TIERS[planId].flatMap((tier) =>
    modelIdsInTier(tier).map((modelId) => ({
      id: modelId,
      name: MODEL_REGISTRY[modelId].presentation.name,
      vendor: MODEL_REGISTRY[modelId].presentation.vendor,
      blurb: MODEL_REGISTRY[modelId].presentation.blurb,
    })),
  );
}

/** `1` → `1 stream`, `3` → `3 streams`. Small, but it is the difference between polish and not. */
function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : pluralForm}`;
}

function featuresFor(planId: PlanId): string[] {
  const limits = PLAN_LIMITS[planId];
  const modelCount = modelsForPlan(planId).length;

  return [
    `${plural(limits.monthlyMessages, "message")} a month`,
    `${plural(modelCount, "model")} across ${plural(new Set(modelsForPlan(planId).map((model) => model.vendor)).size, "provider")}`,
    `${plural(limits.concurrentStreams, "conversation")} streaming at once`,
    `${plural(limits.requestsPerMinute, "request")} a minute`,
    "Long-term memory, on your terms",
    "Web, product, weather and market tools",
  ];
}

const PLAN_COPY: Record<PlanId, { name: string; tagline: string }> = {
  free: {
    name: "Free",
    tagline: "A month of real use, not a demo. No card, no trial clock.",
  },
  pro: {
    name: "Pro",
    tagline: "Every model, room to work, and answers that keep their context.",
  },
};

/**
 * Both plan cards, free first.
 *
 * Returned as a fixed-length tuple so the page can lay out two columns without
 * a runtime length check, and so adding a plan to `PLAN_IDS` is a compile error
 * here rather than a card that silently never renders.
 */
export function buildPlanCards(params: { proPrice: PlanPrice | null }): [PlanCard, PlanCard] {
  return [
    {
      id: "free",
      name: PLAN_COPY.free.name,
      tagline: PLAN_COPY.free.tagline,
      price: { amountMinor: 0, currency: "USD", interval: "month" },
      features: featuresFor("free"),
      models: modelsForPlan("free"),
      featured: false,
    },
    {
      id: "pro",
      name: PLAN_COPY.pro.name,
      tagline: PLAN_COPY.pro.tagline,
      price: params.proPrice,
      features: featuresFor("pro"),
      models: modelsForPlan("pro"),
      featured: true,
    },
  ];
}

/**
 * A price as a person reads it: `$0`, `$20`, `$19.99`.
 *
 * Whole amounts drop the decimals deliberately — "$20.00 / month" reads like a
 * receipt, "$20 / month" reads like a price.
 */
export function formatPlanPrice(price: PlanPrice, locale = "en-US"): string {
  const isWhole = price.amountMinor % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: price.currency,
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  }).format(price.amountMinor / 100);
}

/** `month` → `/ month`. Separated from the amount so the two can be styled apart. */
export function formatPlanInterval(price: PlanPrice): string {
  return `/ ${price.interval}`;
}
