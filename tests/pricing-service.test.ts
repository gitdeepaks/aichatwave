/**
 * Reading a displayable price out of whatever Polar returns.
 *
 * `readFixedPrice` is the whole of the risk in `pricing-service`: the SDK
 * types `product.prices` as a five-member union, four of whose variants this
 * page cannot quote, and the one thing that must never happen on a public
 * pricing page is a confident wrong number. Every case below is a shape Polar
 * genuinely produces.
 */

import assert from "node:assert/strict";
import test from "node:test";
import "./helpers/environment";
import "./helpers/polar-stub";

const pricingService = () => import("@/server/billing/pricing-service");

async function read(product: unknown) {
  const { __testing } = await pricingService();
  return __testing.readFixedPrice(product);
}

test("a fixed monthly price is read in minor units", async () => {
  assert.deepEqual(
    await read({
      isRecurring: true,
      recurringInterval: "month",
      prices: [{ amountType: "fixed", priceAmount: 2000, priceCurrency: "usd" }],
    }),
    { amountMinor: 2000, currency: "USD", interval: "month" },
  );
});

test("the currency is normalized to upper case", async () => {
  const price = await read({
    recurringInterval: "year",
    prices: [{ amountType: "fixed", priceAmount: 19_900, priceCurrency: "eur" }],
  });
  assert.equal(price?.currency, "EUR");
  assert.equal(price?.interval, "year");
});

test("a product with no interval is quoted monthly rather than with no period", async () => {
  const price = await read({
    recurringInterval: null,
    prices: [{ amountType: "fixed", priceAmount: 500, priceCurrency: "usd" }],
  });
  assert.equal(price?.interval, "month");
});

test("the first fixed price wins when a product carries several kinds", async () => {
  const price = await read({
    recurringInterval: "month",
    prices: [
      { amountType: "metered_unit", unitAmount: 3 },
      { amountType: "fixed", priceAmount: 1500, priceCurrency: "usd" },
      { amountType: "fixed", priceAmount: 9900, priceCurrency: "usd" },
    ],
  });
  assert.equal(price?.amountMinor, 1500);
});

test("a metered-only or free product yields no price to quote", async () => {
  assert.equal(await read({ recurringInterval: "month", prices: [{ amountType: "free" }] }), null);
  assert.equal(
    await read({ recurringInterval: "month", prices: [{ amountType: "custom" }] }),
    null,
  );
  assert.equal(await read({ recurringInterval: "month", prices: [] }), null);
});

test("a shape the SDK has changed yields null rather than NaN", async () => {
  assert.equal(await read(null), null);
  assert.equal(await read({}), null);
  assert.equal(await read({ prices: "not-an-array" }), null);
  assert.equal(
    await read({ prices: [{ amountType: "fixed", priceAmount: "2000", priceCurrency: "usd" }] }),
    null,
    "a string amount must not become a price",
  );
  assert.equal(
    await read({ prices: [{ amountType: "fixed", priceAmount: 2000 }] }),
    null,
    "an amount with no currency is not quotable",
  );
});

test("a negative or fractional minor amount is rejected", async () => {
  assert.equal(
    await read({ prices: [{ amountType: "fixed", priceAmount: -100, priceCurrency: "usd" }] }),
    null,
  );
  assert.equal(
    await read({ prices: [{ amountType: "fixed", priceAmount: 19.99, priceCurrency: "usd" }] }),
    null,
    "minor units are integers; a float here means the SDK changed meaning",
  );
});
