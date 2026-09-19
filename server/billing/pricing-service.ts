/**
 * The Pro price, read from the product checkout actually charges.
 *
 * The alternative — a number in the marketing copy — is a promise the billing
 * system never agreed to. Polar holds the price; `POLAR_PRODUCT_ID` names the
 * product; this module is the one place the two are connected for display.
 * When they disagree it is this page that is wrong, so it does not get to
 * guess.
 *
 * Failure returns `null`, never throws, and never a stale-but-plausible
 * number. `/pricing` is a public page and Polar is an upstream that has
 * already been down once in this project's life (see the billing incident in
 * `docs/pro_plan.md`); a dead credential must degrade to "see price at
 * checkout", not to a 500 on the busiest public route.
 */

import { z } from "zod";
import { polarClient } from "@/lib/polar-client";
import { env, polarServer } from "@/lib/env";
import type { PlanPrice } from "@/lib/marketing/plans";
import { polarErrorFacts } from "@/server/billing/polar-error";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";
import { withSpan } from "@/server/observability/tracing";

/**
 * How long a successful read is reused.
 *
 * A price changes at most a few times a year, and the page is public — so the
 * cache is the difference between one Polar call an hour and one per crawler
 * hit. In-process rather than shared: this deploys to one region, a cold
 * instance pays one call, and a second cache to invalidate is not worth the
 * five minutes of staleness it would save.
 */
const PRICE_CACHE_TTL_MS = 60 * 60_000;

/** Negative results are cached far more briefly, so an outage self-heals. */
const PRICE_FAILURE_CACHE_TTL_MS = 60_000;

type CacheEntry = { price: PlanPrice | null; expiresAt: number };

let cache: CacheEntry | null = null;

/**
 * The shape this module needs from Polar's product, and nothing else.
 *
 * Parsed rather than trusted: the SDK types `prices` as a five-member union
 * whose variants carry different fields, and narrowing it by hand is exactly
 * the kind of member access this project forbids on unvalidated data. Zod
 * gives the discriminated read for free and turns an SDK shape change into a
 * caught parse failure instead of `undefined / 100 = NaN` on the page.
 */
const fixedPriceSchema = z.object({
  amountType: z.literal("fixed"),
  priceAmount: z.number().int().nonnegative(),
  priceCurrency: z.string().min(1),
});

const productSchema = z.object({
  isRecurring: z.boolean().optional(),
  recurringInterval: z.enum(["month", "year"]).nullable().optional(),
  prices: z.array(z.unknown()),
});

function readFixedPrice(product: unknown): PlanPrice | null {
  const parsedProduct = productSchema.safeParse(product);
  if (!parsedProduct.success) return null;

  for (const candidate of parsedProduct.data.prices) {
    const parsedPrice = fixedPriceSchema.safeParse(candidate);
    if (!parsedPrice.success) continue;

    return {
      amountMinor: parsedPrice.data.priceAmount,
      currency: parsedPrice.data.priceCurrency.toUpperCase(),
      // A subscription product without an interval is not something to invent
      // one for, but monthly is the only interval this product has ever had
      // and the alternative is showing an amount with no period at all.
      interval: parsedProduct.data.recurringInterval ?? "month",
    };
  }

  return null;
}

/**
 * The Pro plan's price, or null when Polar could not be read.
 *
 * `force` bypasses the cache; it exists for `pnpm polar:doctor` and for tests,
 * not for the request path.
 */
export async function getProPlanPrice(
  params: { log?: Logger; force?: boolean } = {},
): Promise<PlanPrice | null> {
  const log = params.log ?? rootLogger;
  const now = Date.now();

  if (!params.force && cache !== null && cache.expiresAt > now) {
    return cache.price;
  }

  const price = await withSpan(
    "billing.read_price",
    { "billing.product_id": env.POLAR_PRODUCT_ID },
    () => fetchProPlanPrice(log),
  );

  cache = {
    price,
    expiresAt: now + (price === null ? PRICE_FAILURE_CACHE_TTL_MS : PRICE_CACHE_TTL_MS),
  };
  return price;
}

async function fetchProPlanPrice(log: Logger): Promise<PlanPrice | null> {
  try {
    const product = await polarClient.products.get({ id: env.POLAR_PRODUCT_ID });
    const price = readFixedPrice(product);

    if (price === null) {
      // Not an exception: the product exists and has no fixed price this page
      // knows how to quote (metered-only, or a shape the SDK has changed).
      log.warn("billing.price_unreadable", { polarServer, productId: env.POLAR_PRODUCT_ID });
    }
    return price;
  } catch (error) {
    const facts = polarErrorFacts(error);
    log.error(
      "billing.price_read_failed",
      {
        polarServer,
        productId: env.POLAR_PRODUCT_ID,
        upstreamStatus: facts.upstreamStatus,
        upstreamCode: facts.upstreamCode,
      },
      error,
    );
    return null;
  }
}

/** Test seam. Never called from application code. */
export function resetProPlanPriceCache(): void {
  cache = null;
}

export const __testing = { readFixedPrice };
