# ADR-0007 — The workspace lives under `/app`

**Status:** Accepted · **Date:** 2026-09-19 · **Deciders:** owner

## Context

`/` was the chat interface, inside a route group behind `auth.protect()`. There was no public
surface at all: a stranger who typed the domain got a redirect to sign-in, and there was no way to
see what the product was or what it cost before creating an account.

That also made the site unindexable. Every route in the application answered with a redirect, so
there was nothing for a crawler to read, no page to rank, and no sitemap worth generating.

## Decision

Move the workspace to `/app` and give the root to a public marketing surface.

- `app/(marketing)/` → `/` and `/pricing`. A route group, so the URLs stay the ones a visitor and a
  crawler expect.
- `app/app/` → `/app`, `/app/chat/[thread_id]`, `/app/memories`, `/app/profile`, `/app/success`,
  `/app/admin/operations`. All behind `auth.protect()`, all `noindex`.
- `lib/routes.ts` holds every in-app URL. `robots.ts` derives its `Disallow` list from it and
  `sitemap.ts` derives its entries, so a new authenticated route cannot become crawlable by
  omission.
- `next.config.ts` 308s every old path — `/chat/:path*`, `/memories`, `/profile`, `/success`,
  `/admin/:path*` — to its new home. `/` is deliberately absent: it did not move, it changed
  meaning.

## Why a constants module rather than string literals

The move touched a dozen `href="/"` and `router.push(`/chat/${id}`)` literals across components,
and a missed one is a silent 404 — a broken internal link fails no build, no typecheck and no test.
`lib/routes.ts` makes the next such move one edit, and `AppRoute` makes a typo a compile error. The
public/private split in that file is not decoration; it is what `robots.ts` reads.

## Consequences

**Bought.** A landing page and a pricing page that can be indexed, linked and shared. A
`sitemap.xml` with something in it. `metadataBase` and per-route canonicals that mean something.
Clerk's post-sign-in redirect now points somewhere real (`signInFallbackRedirectUrl={ROUTES.app}`);
before, its default of `/` happened to be correct by accident.

**Cost.** Every bookmark and every shared thread link now costs a redirect hop. The Polar
`successUrl` moved with it, so an in-flight checkout started before the deploy lands on the
redirect rather than the page — harmless, and the reason the redirect exists.

**A constraint this surfaced.** The public pages have to render **dynamically**. The proxy issues a
per-request CSP nonce and `script-src` carries `'strict-dynamic'`, which makes host sources —
including `'self'` — inert: only a nonce authorizes a script, and a page prerendered at build time
has none to carry. Both marketing pages call `connection()` for this reason.

It is not a hypothetical. `/_not-found` _was_ statically prerendered, and its script tags shipped
without a nonce, so nothing on that page ever hydrated. It went unnoticed because the page is a
heading and a link. It now calls `connection()` too.

**Watch.** Anything that adds a static page to this app is adding a page whose JavaScript will not
run. Either it calls `connection()`, or the CSP needs rethinking.
