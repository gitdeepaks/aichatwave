/**
 * A stand-in for the Polar SDK client.
 *
 * `@/lib/polar-client` is the single module the whole app reaches Polar
 * through, so stubbing it replaces the vendor without replacing any of this
 * app's billing logic: `resolvePlan`'s warm/stale/cold branches, the mirror
 * writes, the status narrowing and the error mapping in `checkout-service` all
 * still run.
 *
 * Every call is counted. That is what makes the "a warm plan read costs zero
 * Polar calls" property — the whole reason the local mirror exists — testable
 * rather than asserted in a comment.
 */

import "./environment";
import { stubModule } from "./module-stub";

type PolarSubscriptionItem = {
  id: string;
  productId: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  endsAt: Date | null;
};

type PolarBehaviour = {
  subscriptions: PolarSubscriptionItem[];
  /** When set, every SDK call rejects with it. */
  failure: unknown;
  /** What `checkouts.create` reports back, so the response contract can be broken on purpose. */
  checkoutUrl: string;
};

const DEFAULT_CHECKOUT_URL = "https://polar.test/checkout/test";

const behaviour: PolarBehaviour = {
  subscriptions: [],
  failure: null,
  checkoutUrl: DEFAULT_CHECKOUT_URL,
};

export const polarCalls: string[] = [];

function record<TResult>(name: string, result: () => TResult): Promise<TResult> {
  polarCalls.push(name);
  if (behaviour.failure !== null) return Promise.reject(behaviour.failure);
  return Promise.resolve(result());
}

/** An active Polar subscription for the default product, as the SDK would report it. */
export function activeSubscription(
  overrides: Partial<PolarSubscriptionItem> = {},
): PolarSubscriptionItem {
  return {
    id: `sub_${Math.random().toString(36).slice(2, 10)}`,
    productId: "00000000-0000-0000-0000-000000000000",
    status: "active",
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false,
    endsAt: null,
    ...overrides,
  };
}

/** What `subscriptions.list` will return from here on. */
export function setPolarSubscriptions(items: PolarSubscriptionItem[]): void {
  behaviour.subscriptions = items;
  behaviour.failure = null;
}

/** Makes every Polar call reject, for the upstream-failure paths. */
export function setPolarFailure(error: unknown): void {
  behaviour.failure = error;
}

/**
 * A Polar `SDKError` as `polarErrorFacts` reads one: an upstream status and a
 * JSON body, both lifted off the thrown object rather than parsed out of prose.
 */
function polarSdkError(
  statusCode: number,
  body: unknown,
): Error & {
  statusCode: number;
  body: string;
} {
  return Object.assign(new Error(`Polar responded ${statusCode}`), {
    statusCode,
    body: JSON.stringify(body),
  });
}

/** A revoked or wrong-environment token: the operator-owned failure. */
export function polarAuthFailure() {
  return polarSdkError(401, { error: "invalid_token", error_description: "Token is revoked." });
}

/** A request Polar understood and rejected: the retryable, user-facing failure. */
export function polarRequestFailure() {
  return polarSdkError(422, { detail: [{ loc: ["body", "products"], msg: "unknown product" }] });
}

/**
 * Overrides the URL `checkouts.create` reports.
 *
 * Handing back something that is not a URL is how the checkout route is made to
 * fail its own response contract, which is the one path that produces an
 * untyped error and so an `INTERNAL_ERROR` envelope.
 */
export function setPolarCheckoutUrl(url: string): void {
  behaviour.checkoutUrl = url;
}

export function resetPolarStub(): void {
  behaviour.subscriptions = [];
  behaviour.failure = null;
  behaviour.checkoutUrl = DEFAULT_CHECKOUT_URL;
  polarCalls.length = 0;
}

stubModule("@/lib/polar-client", {
  polarClient: {
    subscriptions: {
      list: () =>
        record("subscriptions.list", () => ({ result: { items: behaviour.subscriptions } })),
    },
    customerMeters: {
      list: () => record("customerMeters.list", () => ({ result: { items: [] } })),
    },
    events: {
      ingest: () => record("events.ingest", () => ({ inserted: 1 })),
    },
    customerSessions: {
      create: () =>
        record("customerSessions.create", () => ({
          customerPortalUrl: "https://polar.test/portal",
        })),
    },
    checkouts: {
      create: () => record("checkouts.create", () => ({ url: behaviour.checkoutUrl })),
    },
    customers: {
      getExternal: () => record("customers.getExternal", () => ({ id: "cus_test" })),
      create: () => record("customers.create", () => ({ id: "cus_test" })),
    },
  },
});
