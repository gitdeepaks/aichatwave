import assert from "node:assert/strict";
import test from "node:test";

import { MODEL_REGISTRY, modelIdsInTier } from "@/lib/ai/model-registry";
import { PLAN_LIMITS } from "@/lib/billing/plan-policy";
import {
  buildPlanCards,
  formatPlanInterval,
  formatPlanPrice,
  type PlanPrice,
} from "@/lib/marketing/plans";

const MONTHLY_20: PlanPrice = { amountMinor: 2000, currency: "USD", interval: "month" };

test("the pricing page offers exactly the two plans, free first", () => {
  const [free, pro] = buildPlanCards({ proPrice: MONTHLY_20 });
  assert.equal(free.id, "free");
  assert.equal(pro.id, "pro");
  assert.equal(pro.featured, true);
  assert.equal(free.featured, false);
});

/**
 * The whole point of the module: a limit raised in `plan-policy.ts` moves the
 * marketing copy with it. If this test ever needs a literal updated by hand,
 * the derivation has been broken.
 */
test("plan features quote the limits the server enforces", () => {
  const [free, pro] = buildPlanCards({ proPrice: MONTHLY_20 });

  assert.ok(
    free.features.some((line) =>
      line.includes(PLAN_LIMITS.free.monthlyMessages.toLocaleString("en-US")),
    ),
    `free features did not mention ${PLAN_LIMITS.free.monthlyMessages}`,
  );
  assert.ok(
    pro.features.some((line) =>
      line.includes(PLAN_LIMITS.pro.monthlyMessages.toLocaleString("en-US")),
    ),
    `pro features did not mention ${PLAN_LIMITS.pro.monthlyMessages}`,
  );
  assert.ok(pro.features.some((line) => line.includes(String(PLAN_LIMITS.pro.requestsPerMinute))));
});

test("singular and plural agree with the number in front of them", () => {
  const [free] = buildPlanCards({ proPrice: null });
  // The free plan holds exactly one concurrent stream.
  assert.equal(PLAN_LIMITS.free.concurrentStreams, 1);
  assert.ok(free.features.some((line) => line === "1 conversation streaming at once"));

  const [, pro] = buildPlanCards({ proPrice: null });
  assert.ok(pro.features.some((line) => line.endsWith("conversations streaming at once")));
});

test("the free plan lists only free-tier models and Pro lists all of them", () => {
  const [free, pro] = buildPlanCards({ proPrice: MONTHLY_20 });

  assert.deepEqual(
    free.models.map((model) => model.id),
    modelIdsInTier("free"),
  );
  for (const model of free.models) {
    assert.equal(MODEL_REGISTRY[model.id].tier, "free");
  }

  const proIds = new Set(pro.models.map((model) => model.id));
  for (const modelId of [...modelIdsInTier("free"), ...modelIdsInTier("subscription")]) {
    assert.equal(proIds.has(modelId), true, `${modelId} missing from the Pro card`);
  }
});

test("an unreadable Polar price leaves the Pro card without one rather than guessing", () => {
  const [free, pro] = buildPlanCards({ proPrice: null });
  assert.equal(pro.price, null);
  // The free plan's price is a fact this app owns, so it is never null.
  assert.deepEqual(free.price, { amountMinor: 0, currency: "USD", interval: "month" });
});

test("whole amounts drop their decimals and fractional ones keep them", () => {
  assert.equal(formatPlanPrice({ amountMinor: 2000, currency: "USD", interval: "month" }), "$20");
  assert.equal(formatPlanPrice({ amountMinor: 0, currency: "USD", interval: "month" }), "$0");
  assert.equal(
    formatPlanPrice({ amountMinor: 1999, currency: "USD", interval: "month" }),
    "$19.99",
  );
});

test("a non-dollar currency formats in its own symbol", () => {
  assert.equal(formatPlanPrice({ amountMinor: 1500, currency: "EUR", interval: "month" }), "€15");
});

test("the interval is rendered apart from the amount", () => {
  assert.equal(formatPlanInterval(MONTHLY_20), "/ month");
  assert.equal(
    formatPlanInterval({ amountMinor: 20_000, currency: "USD", interval: "year" }),
    "/ year",
  );
});
