# ADR-0003 — Polar over Stripe

**Status:** Accepted · **Deciders:** owner

## Context

The product needs a paid tier: one subscription, one product, a hosted checkout, a place for a
customer to change their card or cancel, and usage metering for tokens.

Stripe is the default answer and does all of it. It also expects you to build the parts around it:
a customer portal configuration, a tax story, invoice templates, and — for usage — a meter pipeline
of your own. For a single-product subscription with a token meter that is a lot of surface for very
little product.

Polar is a merchant of record. It handles sales tax and VAT registration, ships a hosted customer
portal, and has first-class usage meters with an `events.ingest` API that matches how this app
already counts tokens.

## Decision

Use Polar for checkout, the customer portal, subscription state and usage ingestion.
`POLAR_PRODUCT_ID` names the one product; `lib/polar-client.ts` is the only module that talks to it.

Polar remains the **billing record**. This app keeps a local `subscription` mirror for read
performance, never as the source of truth: `user.billing_synced_at` is null until Polar has been
consulted at least once for that user, and a null mirror is a cold cache, not "no subscription".
`/pricing` reads the displayed price from the Polar product that checkout actually charges, rather
than from a constant (`server/billing/pricing-service.ts`).

Checkout and the portal are **server-owned**. They used to be client-side `authClient.checkout()`
calls from the `@polar-sh/better-auth` plugin, which went with Better Auth
([ADR-0001](0001-clerk-over-better-auth.md)). The client now asks this app for a URL and navigates.
That is the better shape regardless: the product and the price are chosen on the server, where the
user cannot.

## Consequences

**Bought.** No tax registration. A portal that exists without being built. Usage meters that take
the token counts the agent already produces.

**Cost.** A smaller vendor than Stripe, with less operational history, and no second processor to
fail over to. Sandbox and production are entirely separate systems with separate tokens and product
ids — a token from one returns `401 invalid_token` against the other.

**Watch.** That last point has already cost an outage. Production checkout returned
`502 UPSTREAM_ERROR`; the cause was an expired `POLAR_ACCESS_TOKEN`, and the original code could
not distinguish "the credential is dead" from "the request was malformed" because both surfaced as
an identical opaque 502. `server/billing/polar-error.ts` now separates them: a credential failure is
`SERVICE_UNAVAILABLE`, because no amount of user retrying fixes it. The full account is in
`docs/pro_plan.md` under "Billing incident — 2026-09-09".

Also watch that this deployment runs `POLAR_SERVER=sandbox` even on the live site. That is
deliberate and normal before launch — sandbox takes test cards only and moves no real money —
and switching to production is a three-value change: server, token, and product id, never one.
