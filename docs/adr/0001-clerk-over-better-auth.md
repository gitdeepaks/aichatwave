# ADR-0001 — Clerk over Better Auth

**Status:** Accepted · **Date:** 2026-09-09 · **Deciders:** owner

## Context

The application shipped with Better Auth: `better-auth` plus `drizzleAdapter`, locally owned
`user`, `session`, `account` and `verification` tables, an `app/api/auth/[...all]` catch-all, about
seven hundred lines of hand-built sign-in and sign-up forms, Google and GitHub client secrets in
`.env`, and `@polar-sh/better-auth` wiring checkout and the customer portal from the client.

That worked. What it cost was ownership of a category of problem this product has no interest in
being good at: session rotation, OAuth callback edge cases, bot protection on sign-up, device
management, and the forms themselves — which were the largest single body of UI in the repository
and none of it product.

The seven hundred lines were the tell. They were being maintained, not used.

## Decision

Replace Better Auth with Clerk (`@clerk/nextjs`), keep a **local mirror** of the identity rather
than treating Clerk as the database, and enforce authorization **at each resource** rather than in
middleware.

Three parts, each load-bearing:

**Clerk owns sessions and OAuth.** The `session`, `account` and `verification` tables are gone.
Provider secrets moved to the Clerk dashboard. The forms are Clerk widgets inside this app's own
branded shell (`components/auth/auth-screen-shell.tsx`).

**The `user` table remains, as a mirror.** `user.id` is the Clerk user id verbatim, because
`thread.user_id` and `subscription.user_id` are foreign keys and a chat application cannot resolve
its own data through a network call to an identity provider. The row is kept current two ways:
just-in-time on the write paths that need it (`ensureUserProvisioned`), and by the Clerk webhook
afterwards. Both go through one idempotent upsert.

**Authorization sits on resources, not in `proxy.ts`.** The first implementation gated with
`createRouteMatcher()`; the Clerk SDK emitted a deprecation warning pointing at a migration guide,
and the argument behind it holds: Server Functions are invoked by id rather than by path, and path
normalization between the matcher and the router can diverge. A matcher is a false sense of
security. So: `auth.protect()` in the workspace layout, `requireSessionUserId()` inside
`createRouteHandler`, `getSessionUserId()` in server actions, and every repository query scoped by
`user_id`.

## Consequences

**Bought.** No password ever reaches this application. No reset flow to attack. Bot protection,
device management and session rotation become someone else's on-call. The typed JSON error envelope
survived the move — under middleware gating an unauthenticated `GET /api/threads` returned Clerk's
own redirect; it now returns `401 {"error":{"code":"UNAUTHORIZED",…}}` as designed.

**Cost.** A hard dependency on a third party for sign-in: if Clerk is down, nobody gets in, and
there is no fallback path because there is no local credential to fall back to. A per-seat bill
that scales with users. And the styling problem recorded in [ADR-0009](0009-clerk-appearance-via-css.md):
the widgets are someone else's DOM.

**Watch.** The webhook race. `ensureUserProvisioned` exists because Clerk delivers `user.created`
asynchronously and a user who signs up and immediately sends a message can beat it to a foreign-key
violation. Any _new_ write path that references `user.id` has to call it too — this is the failure
mode most likely to be reintroduced.
