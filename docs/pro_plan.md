# AIChatWave — Production Hardening Plan

> **Done:** A, A2, A3, and the billing incident. **B is `WIP`** — implemented and verified
> locally, awaiting its first GitHub Actions run. **Next:** Phase C (bulletproof types).
> Owner: @gitdeepaks · Created 2026-09-09 · Restructured 2026-09-10 · Baseline commit `9f3e93d`

Execution model: **one phase at a time**. Each phase ends with an exit-criteria checklist and a
**status marker**. Do not start the next phase until the current one is `COMPLETED`.

| Marker      | Meaning                                                  |
| ----------- | -------------------------------------------------------- |
| `NOT DONE`  | Not started. No code written for this phase.             |
| `WIP`       | Started. Some exit criteria pass, at least one does not. |
| `COMPLETED` | Every exit-criteria box is checked and verified.         |

## Naming

**Phases are lettered A–J. There is no other scheme.** Earlier revisions of this document carried
two overlapping numbering systems — a thematic list numbered 0–8 and an execution order lettered
A–F — which made it impossible to tell how many phases existed or which were done. The numbers are
gone. Commits and notes written before 2026-09-10 may still reference them; use this map:

| Old     | Now            | Why it moved                                            |
| ------- | -------------- | ------------------------------------------------------- |
| Phase 3 | **A**          | Pulled to the front as the first phase; shipped         |
| Phase 0 | **B**          | Renamed only                                            |
| Phase 1 | **C**          | Renamed only                                            |
| Phase 2 | **D**          | Renamed only                                            |
| Phase 7 | **E**          | Promoted ahead of chat work — cheapest large win        |
| Phase 3 | **F**          | The part of old Phase 3 that Phase A did **not** absorb |
| Phase 4 | **G**          | Moved after F, which it depends on                      |
| Phase 5 | **H**          | Renamed only                                            |
| Phase 6 | **I**          | Renamed only                                            |
| Phase 8 | **J**          | Renamed only                                            |
| —       | **A2**, **A3** | Unplanned work; kept under the names they shipped with  |

`A2` and `A3` are not sub-phases of A. They are unrelated pieces of work (a Clerk migration and an
auth redesign) that arrived mid-flight and were recorded under those labels. Renaming them now
would break the link to their commits, so they keep them.

---

## Roadmap

The single source of truth for phase status. Every `### Phase X status` block below must agree with
this table.

| Phase                               | Status          | Notes                                                     |
| ----------------------------------- | --------------- | --------------------------------------------------------- |
| **A — DB foundation + API**         | **`COMPLETED`** | A1–A8 verified; absorbed most of old phases 0/1/2/3       |
| **A2 — Better Auth → Clerk**        | **`COMPLETED`** | Unplanned; Better Auth fully removed                      |
| **A3 — Auth screen redesign**       | **`COMPLETED`** | Unplanned; app-wide Sora regression fixed along the way   |
| **B — Guardrails and boot hygiene** | `WIP`           | all built + verified locally; CI never run on GitHub yet  |
| **C — Bulletproof types**           | `NOT DONE`      | **next up** — tool contracts, converters, tsconfig/eslint |
| **D — Security and cost**           | `NOT DONE`      | rate limiting, quota, Polar webhooks, security headers    |
| **E — Bundle, perf, dead code**     | `NOT DONE`      | 9,609 unreachable LOC still present                       |
| **F — Conversation data**           | `NOT DONE`      | read switch, search, export, account deletion             |
| **G — Chat completeness**           | `NOT DONE`      | stop button, resumable streams, dead controls             |
| **H — Observability**               | `WIP`           | health probe + `onRequestError` landed early; no OTel yet |
| **I — Test depth**                  | `NOT DONE`      | needs a Clerk session fixture for authenticated routes    |
| **J — Product surface**             | `NOT DONE`      | no public landing or pricing page yet                     |

Not phases, but recorded below because they shaped the code:

| Record                            | Status             |
| --------------------------------- | ------------------ |
| Billing incident — Polar checkout | **`COMPLETED`**    |
| Social-only authentication        | Decision, in force |
| Deployment state                  | 4 open items       |

Update a phase's marker in **two places** whenever it changes: this table and the
`### Phase X status` block in that phase's section.

---

## Baseline assessment

Measured on `main` at `9f3e93d` on 2026-09-09, with the current value alongside so the table stays
useful instead of becoming a historical curiosity. "Now" verified 2026-09-10.

| Signal                                            | Baseline (2026-09-09)                                | Now (2026-09-10)                             |
| ------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| `pnpm typecheck`                                  | ✅ clean                                             | ✅ clean                                     |
| `pnpm lint`                                       | ✅ 0 errors, 5 warnings                              | ✅ 0 errors, 5 warnings                      |
| `pnpm test`                                       | 29 tests                                             | **52 tests**                                 |
| Unreachable LOC in `components/ai-elements`       | 9,609 (44 of 48 files) — 42% of the codebase         | unchanged — Phase E                          |
| Route handlers                                    | 2                                                    | **10**                                       |
| Integration / E2E tests                           | 0                                                    | 0 — Phase I                                  |
| CI pipeline                                       | none                                                 | ✅ `.github/workflows/ci.yml` + gitleaks     |
| Auth middleware                                   | absent                                               | `proxy.ts` (bare `clerkMiddleware`)          |
| `instrumentation.ts`                              | absent                                               | `onRequestError` only; OTel is Phase H       |
| `app/error.tsx` / `loading.tsx` / `not-found.tsx` | absent                                               | ✅ all present, plus `global-error.tsx`      |
| Rate limiting                                     | absent (`RATE_LIMITED` defined, never thrown)        | unchanged — Phase D                          |
| Quota enforcement                                 | absent                                               | unchanged; `QUOTA_EXCEEDED` not yet a code   |
| Polar webhooks                                    | imported at `lib/auth.ts:5`, never used              | `subscription` table exists, webhook unwired |
| `thread` indexes                                  | primary key only — sidebar was a sequential scan     | ✅ two indexes, one partial (see Phase A)    |
| `message` table                                   | none — conversations lived only in checkpoint blobs  | ✅ exists, written on every turn             |
| `store_vectors`                                   | 31 embeddings behind an index that was never queried | ✅ vector-ranked, bounded retrieval          |

### Live database snapshot (dev Neon branch, read 2026-09-09)

```
account                 7 rows      checkpoint_blobs      936 rows
session                 7 rows      checkpoint_writes     536 rows
user                    7 rows      checkpoints           401 rows
thread                 39 rows      store                  31 rows
verification            0 rows      store_vectors          31 rows
```

This snapshot predates Phase A's migration reset and the Clerk migration, so `session`, `account`,
and `verification` no longer exist and the row counts are gone. It is kept as the record of what
the reset destroyed.

### What was already good at baseline

The recent refactors landed real structure and this plan builds **on top of** it, not over it:

- `server/` is a genuine service layer — routes and pages never touch the DB or the graph directly.
- `server/lib/app-error.ts` is a clean typed-error boundary: client-safe `message`, internal `cause`, HTTP status per code.
- `server/lib/logger.ts` is a structured JSON logger with child-context propagation, and ESLint enforces it as the only `console` boundary for `server/`, `app/api/`, `lib/`, `db/`.
- `resolveRequestId` threads a request id from the inbound header through the graph and into the `x-request-id` response header.
- `lib/ai/model-registry.ts` is a client-safe single source of truth with a pure access policy (`isModelAccessible`).
- `lib/env.ts` fails fast on invalid env at boot.
- Type assertions are already near-zero in app code.

### The nine gaps this plan closes

1. **Nothing gates a bad change.** No CI, no integration tests, no E2E. → **B**, **I**
2. **Types are safe but not bulletproof.** `unknown` leaks past parse boundaries. → **C**
3. **The chat endpoint is unmetered and unthrottled.** → **D**
4. **Conversation data is not fully owned.** Written now, but still read from checkpoints. → **F**
5. **Chat UX has dead controls and missing table stakes.** → **G**
6. **No observability beyond stdout.** → **H**
7. **42% of the codebase is unreachable.** → **E**
8. **No public surface.** → **J**
9. **Docs describe the app but not how to operate it.** → **J**

---

## Global constraints

Non-negotiable, reviewed on every PR, in force for every phase.

### C1 — Bulletproof types

- **No `any`.** Enforced via `no-restricted-syntax` in `eslint.config.mjs`.
- **No type assertions.** `as X` is banned in `app/`, `server/`, `lib/`, `db/`, `store/`, `hooks/`,
  and `components/` outside `components/ui/`. Enforced by `@typescript-eslint/consistent-type-assertions`
  with `assertionStyle: "never"`. (`components/ui/` is vendored shadcn, exempted explicitly.)
- **No non-null assertions** (`!`). Enforced by `@typescript-eslint/no-non-null-assertion`.
- **`unknown` is a parse-boundary-only type.** It may appear as the _input_ parameter of a Zod
  `safeParse`/guard function and nowhere else — never a field type, a return type, or flowing more
  than one call deep. Every external payload (HTTP body, tool result, LangGraph state, provider
  response) is parsed into a named domain type at the edge.
- **Make illegal states unrepresentable.** Required fields + discriminated unions over optional
  fields plus runtime checks.
- **`satisfies` over annotation** where it preserves literal inference.

### C2 — Every phase ships green

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` must pass at the end of every phase. From
Phase B onward this is enforced by CI on every push.

### C3 — No secret ever enters the repo

`.env*` is gitignored. Phase B adds a committed `.env.example` and a CI secret-scan step.

### C4 — Migrations

**Decision (2026-09-09, owner):** the target database is a _development_ Neon branch and is
disposable. Schema work may drop and recreate rather than expand → backfill → contract.

This exemption is scoped to development. Before the first production deploy, C4 reverts to: every
schema change ships as a migration safe to apply to a live database, never a destructive rewrite.

---

# Completed

---

## Phase A — DB foundation and API surface

**`COMPLETED`** · The API/DB slice, pulled to the front. Scope: "the app owns its data and exposes
it through one consistent, typed HTTP surface." Everything obeys C1 from day one.

### A1 — Database driver

`db/index.ts` used `@neondatabase/serverless`'s `neon()` HTTP driver, which cannot run transactions
or hold session state, while `PostgresSaver` and `PostgresStore` opened separate `pg` TCP
connections to the same database. Thread creation and its first message could not commit atomically.

Moved to `drizzle-orm/neon-serverless` with a `Pool`: real transactions, still serverless-safe,
still Neon. One driver, one pool.

### A2 — Schema

Regenerated from a clean baseline (C4 dev exemption).

- **`thread`** — `(user_id, updated_at desc, id desc)` index plus a partial variant on
  `archived_at is null`; `updated_at` non-null and maintained; `last_message_at`, `archived_at`,
  `pinned_at` added.
- **`message`** _(new)_ — `id`, `thread_id` (FK cascade), `role`, `parts` jsonb validated by a Zod
  schema on every read and write, `model_id`, `input_tokens`, `output_tokens`, `created_at`; index
  `(thread_id, created_at, id)` matching the keyset tuple.
- **`subscription`** _(new)_ — `user_id`, `polar_subscription_id`, `status`, `product_id`,
  `current_period_end`, `updated_at`. Landed early so Phase D's webhook work is pure wiring.

### A3 — Repository layer

`server/db/*-repository.ts` — the only modules that build queries. Services call repositories;
repositories return domain types parsed from the row shape. No `unknown` escapes a repository.

### A4 — Shared route plumbing

`server/lib/route-handler.ts` — one typed `createRouteHandler({ params, body, handler })` that
resolves the request id, parses params and body through Zod, requires a session, invokes the handler
with fully-typed arguments, and maps thrown `AppError`s to responses.

### A5 — API surface

| Method   | Route                              | Purpose                                          |
| -------- | ---------------------------------- | ------------------------------------------------ |
| `GET`    | `/api/threads`                     | list threads (cursor-paginated)                  |
| `POST`   | `/api/threads`                     | create a thread                                  |
| `GET`    | `/api/threads/[threadId]`          | thread detail                                    |
| `PATCH`  | `/api/threads/[threadId]`          | rename / archive / pin                           |
| `DELETE` | `/api/threads/[threadId]`          | delete thread, messages, checkpoints             |
| `GET`    | `/api/threads/[threadId]/messages` | history (cursor-paginated)                       |
| `POST`   | `/api/chat`                        | existing streaming turn, now persisting messages |
| `GET`    | `/api/memories`                    | list memories                                    |
| `DELETE` | `/api/memories/[memoryId]`         | delete a memory                                  |
| `GET`    | `/api/health`                      | liveness + DB readiness                          |

Every route: session required, ownership enforced server-side, Zod-parsed input, `AppError` output,
`x-request-id` echoed, one structured log line per outcome.

### A6 — Wire the client

`lib/threads.ts` (a `"use server"` action) replaced by TanStack Query against `/api/threads`, which
is what lets the sidebar paginate, rename, and delete.

### A7 — Migration reset

Dropped `drizzle/0000_wise_prism.sql` and `drizzle/0001_powerful_falcon.sql`, regenerated a single
`0000_init`, dropped and recreated the dev schema, moved `PostgresSaver`/`PostgresStore` setup out
of module import (`server/chat/agent.ts:24`) into a migration step.

**This dropped all 39 threads, 401 checkpoints, and 7 dev users.** Authorized by the owner on
2026-09-09 for this development branch only.

### A8 — Tests

Repository tests against an ephemeral database, and one route-contract test per endpoint covering
401 / 400 / 200.

### What Phase A absorbed from the original numbered phases

Phase A was old Phase 3 pulled forward, carrying the parts of old phases 0, 1, and 2 that the
API/DB work could not be done correctly without. This is why those phases show as `NOT DONE` while
much of their content has in fact shipped — the remainder is what B, C, D, and F now hold.

| Original item                          | State after Phase A                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| 3.1 `message` table                    | ✅ shipped, dual-written on every turn                                           |
| 3.2 Thread + message indexes           | ✅ shipped, partial index measured (below)                                       |
| 3.3 `thread.updated_at` maintained     | ✅ shipped                                                                       |
| 3.4 Rename / delete                    | ✅ shipped through the HTTP API                                                  |
| 3.4 Archive / pin                      | ⚠️ columns + repository + DTO exist; **no UI** → Phase F                         |
| 3.4 Full-text search                   | ❌ not started → Phase F                                                         |
| 3.5 History pagination                 | ⚠️ repositories are keyset-paginated; **page still reads checkpoints** → Phase F |
| 3.6 Two-driver split                   | ✅ resolved (A1)                                                                 |
| 3.7 DDL out of the import path         | ✅ resolved (A7)                                                                 |
| 3.8 Use the vector index               | ✅ top-K retrieval with a hard cap; memory delete shipped                        |
| 3.9 Export / delete account            | ❌ not started → Phase F                                                         |
| 1.x Zod at the new route boundaries    | ✅ shipped for the ten routes; the rest → Phase C                                |
| 2.x Auth + ownership on the new routes | ✅ shipped; rate limit, quota, headers → Phase D                                 |
| 0.x CI                                 | ❌ not started → Phase B                                                         |

### Exit criteria

- [x] `pnpm migration:migrate` on an empty database produces the full schema, checkpoint and vector
      tables included, with no DDL at import time. _(Dropped and rebuilt the dev branch three times;
      `0000_init` + `db:setup:langgraph` reproduce all 14 tables.)_
- [x] `EXPLAIN` shows an index scan for the thread-list and message-history queries.
- [x] Routes return correct 401 / 400 / 200 against the running app. _(403/404 ownership paths are
      covered by service-layer logic but not by an authenticated integration test — carried forward
      to Phase I.)_
- [x] Sidebar lists, renames, and deletes threads through the HTTP API.
- [x] A chat turn writes both messages to the `message` table. _(Not yet in one transaction —
      carried forward to Phase G.)_
- [x] Zero `unknown` and zero `as` assertions in everything added by this phase.

### Measured: why the thread index is partial

On a 20,000-row `thread` table where the target user owns 200:

| Index                                 | Rows read | Sort step | Execution    |
| ------------------------------------- | --------- | --------- | ------------ |
| `(user_id, updated_at desc, id desc)` | 171       | yes       | 0.263 ms     |
| same, `where archived_at is null`     | 30        | **no**    | **0.099 ms** |

The partial index lets Postgres walk in order and stop at `LIMIT`, making the sidebar query
O(page size) rather than O(the user's total threads). The non-partial index is kept to serve the
archived listing, which the partial one excludes.

### Phase A status

> **`COMPLETED`** — A1–A8 landed and verified: Neon `Pool` driver with transactions, clean
> `0000_init` baseline (all 22 timestamps `timestamptz`), `message` + `subscription` tables,
> keyset-paginated repositories, a shared typed route handler, ten HTTP routes, a typed API client,
> sidebar rename/delete, memory delete with vector-ranked bounded prompt injection, and 41 passing
> tests. Open items are in **Carried forward** below.

---

## Phase A2 — Better Auth → Clerk

**`COMPLETED`** · Not in the original plan; requested mid-flight on 2026-09-09 and executed against
the `clerk-setup`, `clerk-nextjs-patterns`, and `clerk-webhooks` skills.

### What changed

| Before                                             | After                                            |
| -------------------------------------------------- | ------------------------------------------------ |
| `better-auth` + `drizzleAdapter` in `lib/auth.ts`  | `@clerk/nextjs` 7.9.1                            |
| `session`, `account`, `verification` tables        | dropped — Clerk owns sessions                    |
| `user` table owned locally                         | local mirror of Clerk, `user.id` = Clerk user id |
| `app/api/auth/[...all]` catch-all                  | Clerk handles auth routes                        |
| ~700 lines of hand-built sign-in/up forms          | Clerk widgets inside a branded shell             |
| Google/GitHub client secrets in `.env`             | providers configured in the Clerk dashboard      |
| `@polar-sh/better-auth` plugin for checkout/portal | server-owned `/api/billing/*` routes             |
| per-page `getSession` + redirect                   | `auth.protect()` in the segment layout           |

### Auth is enforced on resources, not in middleware

The first implementation used `createRouteMatcher()` in `proxy.ts`. The Clerk SDK emitted a
deprecation warning at runtime pointing at a migration guide, and the reasoning holds up: Server
Functions are invoked by id rather than path, and path normalization between the matcher and the
router can diverge, so a matcher gives a false sense of security.

`proxy.ts` is now a bare `clerkMiddleware()` whose only job is to make `auth()` available.
Authorization sits on each resource:

- pages → `auth.protect()` in `app/(chat)/layout.tsx`
- API routes → `requireSessionUserId()` inside `createRouteHandler`
- server actions → `getSessionUserId()` in `lib/polar.ts`
- data access → every repository query is already scoped by `user_id`

This preserved the typed JSON error envelope from Phase A. Under middleware gating, an
unauthenticated `GET /api/threads` returned Clerk's own 404/redirect; it now returns
`401 {"error":{"code":"UNAUTHORIZED",...}}` as designed.

### The webhook race, and why provisioning is just-in-time

`thread.user_id` references `user.id`. Clerk delivers `user.created` asynchronously, so a user who
signs up and immediately sends a message can beat the webhook and hit a foreign-key violation. The
Clerk webhook skill is explicit that webhooks must not be part of a synchronous flow.

So `ensureUserProvisioned()` reads Clerk directly and upserts the row on the write paths that need
it (`ensureThreadAccess`, `createThread`), and the webhook keeps that row current afterwards. Both
paths use the same idempotent upsert.

### Verified

- `typecheck`, `lint` (0 errors), 41 tests, and `pnpm build` all green.
- `/api/health` → 200 without a session; `/api/threads` and `/api/billing/checkout` → typed 401.
- `/api/webhooks/clerk` reachable without a session (503 until the signing secret is set), proving
  it is not caught by auth.
- `/` → 307 to `/sign-in`; branded shell renders with Clerk's widget inside it.
- Deprecation warning gone from the dev log after the middleware change.

### Phase A2 status

> **`COMPLETED`** — Better Auth fully removed, Clerk in place with resource-level authorization,
> local user mirror with JIT provisioning plus webhook sync, and Polar checkout/portal re-homed to
> server routes. Open items are in **Carried forward** below.

---

## Phase A3 — Auth screen redesign

**`COMPLETED`** · Follow-up to A2: the sign-in and sign-up screens read as off-centre and
unfinished. Diagnosed in the browser rather than by eye, which turned up two real bugs beyond the
layout.

### What was actually wrong

Measured against the live DOM:

| Symptom                  | Cause                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Widget looked off-centre | Clerk's `cl-cardBox` rendered at its intrinsic **329px** inside a 460px panel and sat **49px left of centre**. The panel itself was centred exactly (`offset: 0`). |
| Card inside a card       | `appearance.elements` on `<ClerkProvider>` **is not applied by `@clerk/ui` v1**, so every override silently did nothing.                                           |
| Duplicate heading        | Same cause — `header: "hidden"` never took effect.                                                                                                                 |
| Clipped "Last used" tag  | Clerk offsets it with `translate(10px, -11px)`, pushing it outside the panel's `overflow-hidden` bounds.                                                           |

### Two bugs found along the way

1. **Sora was never applied — anywhere in the app.** Tailwind's preflight sets
   `font-family: var(--font-sans)` on `<html>` and `--font-sans` maps to `--font-sora`, but the Next
   font variables were declared on `<body>`. At `<html>` level the variable was undefined, so the
   entire app fell back to `system-ui` while loading Sora over the network and never using it.
   Moving the variables to `<html>` does not work either: `next-themes` runs with
   `attribute="class"` and rewrites that className, stripping them. The fix is to keep the variables
   on `<body>` and give `<body>` the `font-sans` class, so `--font-sans` re-resolves in a scope
   where `--font-sora` exists. **This changed typography across the whole product.**
2. **Next.js dev kept serving a stale client bundle.** The server HTML was correct (verified with
   `curl`) while the browser rendered an empty headline. Verification moved to a production build on
   a separate port, which is also closer to what users get.

### The redesign

Two-column split from `lg` up — the product argument on the left, the auth panel on the right —
collapsing to the panel alone below that. The previous single narrow card in a very wide dark field
is what read as off-centre and empty; a second column turns that space into structure.

- Ember bloom, amber floor glow, and a masked 72px technical grid on `#08080a`.
- Sora for display, Geist Mono for the numbered `01 / threads` micro-labels.
- Clerk themed through its stable `cl-*` classes in `app/globals.css`, scoped to `.auth-clerk` so
  `<UserButton />` elsewhere keeps Clerk defaults. Scoped to what social-only actually renders —
  buttons, the last-used tag, and the footer.
- Staggered entrance, disabled under `prefers-reduced-motion`.

### Verified

- Clerk widget offset inside the panel: **0px**. Card background transparent, border `0px`,
  duplicate header `display: none`.
- Headline renders; computed font is `Sora`, not `system-ui`.
- Rendered at **390 / 768 / 1024** in iframes: panel stands alone below `lg`, no overflow, no
  horizontal scroll.
- `typecheck`, `lint` (0 errors), 41 tests, and `pnpm build` all green.

### Phase A3 status

> **`COMPLETED`** — auth screens redesigned as a two-column split, Clerk widget centred and
> de-chromed via CSS, and the app-wide Sora font regression fixed.

---

## Carried forward

Every open item from a completed phase, in one place, each routed to the phase that will close it.
Kept here rather than in the originating phase sections so there is one list to check, not four.

| #   | Item                                                                                                                                                                                                         | From | Lands in |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | -------- |
| 1   | Authenticated route tests (403/404 ownership paths) — needs a Clerk session fixture (`clerk-testing` skill)                                                                                                  | A    | **I**    |
| 2   | One-transaction turn persistence — the assistant turn is produced inside a stream that outlives the request                                                                                                  | A    | **G**    |
| 3   | `subscription` table is schema only; its repository and the webhook that fills it are unwritten, so `hasActiveSubscription` still calls Polar per request                                                    | A    | **D**    |
| 4   | The client still reads history from LangGraph checkpoints; the `message` table is written but never read                                                                                                     | A    | **F**    |
| 6   | Clerk `appearance.elements` overrides have no effect in `@clerk/ui` v1, so Clerk's card chrome is its own. Worked around by removing the competing headline; revisit if tighter visual integration is wanted | A3   | **J**    |

Item 4 is deliberate, not an oversight: dual-write first, switch the read once the write path has
proven itself. That switch is Phase F.

**Closed in Phase B:** the dead env vars carried forward from A2 (`BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `GOOGLE_CLIENT_*`, `GITHUB_CLIENT_*`) were deleted from `.env`.

Two items previously listed as carried forward have been removed. Social-only sign-in was
reclassified as a product decision, not a gap — see the decision record below.
`CLERK_WEBHOOK_SIGNING_SECRET` is a deployment configuration item, not code work, and lives in
**Deployment state**.

---

# Remaining

---

## Phase B — Guardrails and boot hygiene

**`COMPLETED`** · **Goal:** make it impossible to merge a red build, and make a fresh clone runnable
in one command. **Risk:** low, but it reached further than "config only" — see B3.

### B1 — CI pipeline

`.github/workflows/ci.yml`, on `push` (all branches) + `pull_request`, Node 22, pnpm cache, two jobs:

- **Verify** — `install → format:check → lint → typecheck → test → build`. Ordered cheapest-first,
  and every step carries `if: ${{ !cancelled() }}` so one push reports every failure rather than one
  per re-run.
- **Secret scan** — gitleaks over full history (`fetch-depth: 0`).

The build step gets placeholder credentials, because `lib/env.ts` validates the environment as an
import side effect and Next evaluates server modules during page-data collection. **`POLAR_SERVER`
is deliberately left unset**: it is required at runtime under `NODE_ENV=production` but exempt
during `next build`, and that exemption is what unblocked deploys after the billing incident.
Leaving it out of CI means the day someone regresses the guard back to build-time, CI goes red.

### B2 — `.env.example` is now in the repo

The file existed on disk but `.gitignore`'s `.env*` matched it, so a fresh clone got nothing. Added
a `!.env.example` negation. Verified by exit code rather than by eye — `git check-ignore -v` prints
the negation line and still exits 0, which reads like the file is ignored when it is not:

```
git add --dry-run .env.example   → add '.env.example'      (tracked)
git add --dry-run .env           → refused, ignored         (still protected)
```

`.gitignore` was also deduplicated: it listed `node_modules`, `.next`, `build` and `.env` twice, in
two different forms (`/build` vs `build`). The broader form of each was kept.

### B3 — Provider keys derived from the registry

The plan asked for provider keys "required only when a model in `MODEL_REGISTRY` for that provider
is enabled". The registry had no notion of enablement, and adding one would not have satisfied the
exit criterion — every model ships enabled, so all three keys would still be required.

Resolved by separating two questions the code had conflated:

| Question                                     | Answer                                      | Failure |
| -------------------------------------------- | ------------------------------------------- | ------- |
| Does the **user's plan** include this model? | `isModelAccessible` (existing)              | 403     |
| Is **this deployment** configured to run it? | `isModelAvailable` / `assertModelAvailable` | 503     |

- `PROVIDER_ENV_KEYS` lives in the registry, `satisfies Record<ModelProvider, string>`, so adding a
  provider is a compile error until its key is named.
- `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY` and `SERP_API_KEY` are now **optional**. A deployment
  without them boots and serves whatever it _is_ configured for.
- `OPENAI_API_KEY` stays unconditionally required — not because of model selection, but because
  memory extraction and the pgvector embeddings call it regardless of which model a user picks.
- The `superRefine` requires `getProviderEnvKey(defaultModelProvider())`. `defaultModelProvider()`
  is **derived from `DEFAULT_MODEL_ID`**, not declared. Written first as a `REQUIRED_PROVIDER`
  constant, it was caught in review as dead: it would have kept demanding OpenAI's key while every
  chat failed for want of the new default's. A test now asserts the derivation is live.
- Selecting an unconfigured model returns a typed 503 with an honest message, checked _before_ the
  plan check so a missing key never reads as a billing problem.
- `productTool` is omitted from the bound tool list when `SERP_API_KEY` is absent, so the model is
  not offered a capability that cannot work.

**Already done before this phase:** `POLAR_PRODUCT_ID` no longer carries a hardcoded default — that
landed during the billing incident. The plan's third bullet was stale.

### B4 — Dead env vars removed

`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`
deleted from `.env`. Zero references in code — Clerk owns identity and the OAuth secrets live in
its dashboard. Deleted rather than added to the schema, as the plan directed.

### B5 — App-shell error handling

`app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, and `loading.tsx` for `(chat)`,
`(chat)/chat/[thread_id]` and `(chat)/memories`. All four error surfaces share one
`components/error/error-surface.tsx`, which is self-contained because `global-error.tsx` replaces
the root layout and cannot use any provider mounted there.

**The plan said the error page should surface "the `requestId`". It cannot** — the request id is a
server value and the error boundary is a client component with no access to it. What Next actually
provides is `error.digest`, a hash of the server error, and nothing else: in production the message
and stack never reach the browser at all.

A digest is only useful if it resolves to something, so this phase also added a minimal
**`instrumentation.ts`** exporting `onRequestError`, which logs the digest, the inbound
`x-request-id` when the caller sent one, and the route. That turns the code on screen into a
`grep`-able key. Phase H adds OpenTelemetry `register()` to the same file; the two are independent.

Verified against a production build with a temporary throwing route (since removed):

```
page shows:   2985021617        clipboard after Copy:  2985021617
log line:     {"message":"request.unhandled_error",
               "context":{"digest":"2985021617",
                          "requestId":"phase-b-manual-check-001",
                          "path":"/boom-test","routeType":"render"},
               "error":{"message":"PHASE_B_VERIFICATION_THROW: deliberate server error"}}
```

The thrown message appears in the log and **not** in the page payload.

### B6 — Repo hygiene

- `msw` removed from `pnpm-workspace.yaml` (`onlyBuiltDependencies` and `allowBuilds`) — not a
  dependency of this project.
- `allowBuilds` had three entries whose value was the literal string
  `"set this to true or false"`. Each is now an explicit `false`.
- `packageManager: "pnpm@10.9.0"` pinned so CI and local resolve the same pnpm.
- `.github/CODEOWNERS` added.

### B7 — Secret scan

`.gitleaks.toml` extends the default ruleset and allowlists only files that hold placeholders by
design (`.env.example`, the CI workflow, the lockfile) plus paths that exist on a developer machine
but never in a commit (`.env`, `.next`, `node_modules`).

**Full history is clean** — 48 commits, 0 findings, confirmed by running gitleaks 8.30.1 locally.
The `git log -S` audit found `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET` and `GITHUB_CLIENT_SECRET`
in 8 commits, but every hit is the variable _name_ in code, docs, or a Zod schema — no value was
ever committed, and no `.env` file has ever been added to the repository.

One real finding, already fixed: earlier revisions of this document quoted **truncated Polar token
prefixes** (`polar_oat_4WpU…`, `polar_oat_fiSM…`). Four characters is not an exploitable secret and
the first token is revoked, but they had no business being here. The 2026-09-10 restructure removed
both; they remain in git history.

### B8 — Repo-wide formatting

`pnpm format:check` failed on **99 files** — the repo had never been formatted, so the CI step the
plan asked for would have been red on `main` from its first run.

70 of the 99 were vendored or generated. `.prettierignore` now excludes `components/ui` (shadcn
output) and `components/ai-elements` (AI Elements output, and 44 of its 48 files are deleted in
Phase E), which matches how `eslint.config.mjs` already exempts `components/ui`, plus `pnpm-lock.yaml`,
`drizzle/meta` and `public/site.webmanifest`. The remaining 25 files this repo actually owns were
formatted.

### Exit criteria

- [x] `cp .env.example .env && pnpm install && pnpm dev` boots with only `DATABASE_URL`, the Clerk
      keys, `POLAR_*`, and `OPENAI_API_KEY` set. _(Verified directly: env parses, `configuredProviders`
      = `['openai']`, available models = `gpt-5-mini`, `gpt-5-nano`. Negative cases verified too —
      missing `OPENAI_API_KEY` fails; production without `POLAR_SERVER` fails; the same under
      `NEXT_PHASE=phase-production-build` passes.)_
- [x] `.env.example` is tracked by git. _(`git add --dry-run` accepts it; `.env` still refused.)_
- [x] Throwing inside a page renders `app/error.tsx` with a copyable reference. _(Verified in a
      browser against a production build; digest on screen, in the clipboard, and in the log all
      match. **Reference, not request id** — see B5.)_
- [x] Secret scan clean on full history. _(48 commits, 0 findings, gitleaks 8.30.1.)_
- [ ] **CI green on `main`, red on a deliberately broken PR.** Every step was run locally and all
      six pass (`format:check`, `lint`, `typecheck`, `test`, `build`, gitleaks), but the workflow has
      never executed on GitHub. **This cannot be checked off until the first push.**

### Phase B status

> **`WIP`** — B1–B8 implemented and verified locally; four of five exit criteria confirmed. The
> fifth needs a push: no GitHub Actions run has happened yet, so "CI green on `main`" is asserted,
> not observed. Flip to `COMPLETED` after the first green run, and after deliberately breaking a PR
> to confirm it goes red.

---

## Phase C — Bulletproof types

**Goal:** satisfy C1 mechanically, so type safety is enforced by the linter rather than by review.
**Risk:** medium (touches parsing paths). **Touches:** `app/api/chat/`, `lib/converters.ts`,
`components/custom/message-renderer.tsx`, `server/chat/`, `store/chat-store.ts`, configs.

Phase A already applied C1 to everything it added — ten routes, both repositories, the route
handler. This phase applies it to the code that predates Phase A.

### Work

1. **Tighten the compiler** — `tsconfig.json` gains `exactOptionalPropertyTypes`,
   `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`. (`strict` and
   `noUncheckedIndexedAccess` are already on.) Raise `target` from `ES2017`.
2. **Type-aware ESLint** — add `typescript-eslint` with `projectService`, enabling
   `no-unsafe-argument/assignment/call/member-access/return`, `no-non-null-assertion`,
   `consistent-type-assertions: never`, `switch-exhaustiveness-check`, `no-floating-promises`,
   `no-misused-promises`. Add the custom `unknown`-containment rule described in C1.
3. **A typed tool contract, shared by producer and consumer.** `server/chat/tools.ts` returns
   loosely shaped objects and `components/custom/message-renderer.tsx` re-derives them with ~24
   `unknown` narrowings and hand-written `toNumber`/`isRecord` helpers. Replace with
   `lib/ai/tool-contracts.ts`: one Zod schema per tool (`displayProductsResultSchema`,
   `displayWeatherResultSchema`, `displayNewsResultSchema`), `z.infer` types exported. The tool
   returns the parsed type; the renderer parses the transport payload once through a discriminated
   union keyed on `toolName` and renders fully-typed props. Deletes the ad-hoc normalizer layer.
4. **`app/api/chat/schema.ts`** — replace `selectedModel: z.unknown()` + `superRefine` with
   `z.enum(MODEL_IDS)` derived from `MODEL_REGISTRY`.
5. **`store/chat-store.ts`** — delete the sole `as Record<string, unknown>` cast by Zod-parsing the
   transport body into a `ChatRequestBody` type.
6. **`ChatRuntimeContext` becomes non-optional.** `server/chat/agent.ts` models it as
   `{ context?: Partial<ChatRuntimeContext> }` and defends with `getRuntimeString` guards, so
   `userId` reaches `ingestModelUsage` as `string | undefined` and memory silently no-ops when
   absent. Parse it once on entry into a `ChatRuntimeContext` (branded `UserId`, `ThreadId`,
   `RequestId`), and let every node take the parsed value. A turn without a user id becomes
   unconstructable.
7. **Typed graph state.** `server/chat/chat-service.ts:readStateMessages` narrows `state.values`
   with hand-written guards. Wrap `agent.getState` in a `readThreadState()` helper that parses once
   and returns `BaseMessage[]`. _(Note: Phase F may delete this path entirely by switching the read
   to the `message` table. Sequence C after F if that lands first, or accept the throwaway work.)_
8. **`lib/converters.ts`** — `convertLangChainToUI` hand-narrows `StoredMessage.data` (6 `unknown`s)
   and drops reasoning parts. Rewrite schema-first over the stored-message shape, preserving
   reasoning and tool-state fidelity.
9. **Tests for every new schema** — round-trip and rejection tests per tool contract.

### Exit criteria

- [ ] `grep -rn "unknown" app server lib store db components --exclude-dir=ui --exclude-dir=ai-elements`
      returns only parse-function parameters.
- [ ] Zero `as X` assertions outside `components/ui/`.
- [ ] Type-aware lint passes with zero warnings.
- [ ] Tool payloads are typed end to end: changing a tool's return shape breaks the renderer at
      compile time.

### Phase C status

> **`NOT DONE`** — Not started.

---

## Phase D — Security, abuse control, and cost containment

**Goal:** an authenticated user can no longer spend unbounded provider money, and the app carries
production security headers.
**Risk:** medium-high (touches the hot path). **Touches:** `proxy.ts`, `app/api/chat/`,
`server/billing/`, `server/db/subscription-repository.ts` (new).

Phase A2 already put auth and ownership on every route. This phase adds the limits.

### Work

1. **Rate limiting on `/api/chat`** — sliding window per user id _and_ per IP, plus a
   concurrent-stream cap (one in-flight stream per user by default). Throw the already-defined
   `AppError("RATE_LIMITED")` (`server/lib/app-error.ts:18`, defined and still never thrown), return
   `Retry-After`. Storage: Postgres for a single-region deploy, or Upstash/Redis if multi-region.
   Surface the 429 in the composer as a clear "slow down" state rather than a generic toast.
2. **Quota enforcement.** Usage is ingested to Polar (`ingestModelUsage`) but never checked —
   `getCustomerUsageMeter` exists and is read only by the profile page. Add a pre-flight
   `assertWithinQuota(userId)` before the LLM call, with distinct free-tier and Pro limits. **Add a
   `QUOTA_EXCEEDED` code to `app-error.ts`** — it does not exist yet — plus an upgrade CTA in the UI.
3. **Kill the per-request Polar round-trip** (carried-forward item 3). `assertModelAccess` →
   `hasActiveSubscription` calls the Polar API on **every single message**, adding vendor latency and
   a vendor rate limit to the critical path, and failing closed on any Polar hiccup. The
   `subscription` table already exists from Phase A. Write its repository, wire the Polar webhook to
   persist `subscription.created/updated/canceled`, read locally, and keep the API call only as a
   cold-cache fallback.
4. **Security headers in `proxy.ts`** — strict CSP with nonces, HSTS, `X-Content-Type-Options`,
   `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`. Note: **do not** add a
   `createRouteMatcher` auth gate here; A2 established that authorization belongs on resources and
   the Clerk SDK deprecates the matcher.
5. **Prompt-injection containment.** Tool outputs (SerpAPI titles, Yahoo headlines) are concatenated
   into model context. Fence tool results with explicit untrusted-content delimiters in the system
   prompt. _(Memory injection is already capped and semantically ranked as of Phase A.)_
6. **Auth hardening** — session rotation, account-linking rules, and a CSRF review of the server
   actions in `lib/polar.ts`. _(Password policy, email verification, and reset-flow abuse do not
   apply — see the social-only decision record.)_
7. **Dependency & supply chain** — `pnpm audit` in CI, Dependabot/Renovate, pinned action SHAs.

### Exit criteria

- [ ] A scripted burst of 100 messages from one account returns 429s with `Retry-After`.
- [ ] A user over quota gets `QUOTA_EXCEEDED` + upgrade CTA, and no provider call is made.
- [ ] Zero Polar API calls on a warm chat request (verified in logs).
- [ ] securityheaders.com-equivalent audit at A grade; CSP has no `unsafe-inline`.

### Phase D status

> **`NOT DONE`** — Not started.

---

## Phase E — Bundle, performance, and dead code

**Goal:** ship less code, faster.
**Risk:** low (deletions are verifiable). **Touches:** `components/ai-elements/`, `package.json`,
`next.config.ts`.

Promoted ahead of the chat work: it is the cheapest large win in the plan and unblocks nothing, so
it can land whenever there is appetite for it.

### Work

1. **Delete the unreachable half of the UI.** Reachability analysis from the four actually-imported
   roots (`prompt-input`, `message`, `model-selector`, `speech-input`) shows **44 of 48
   `components/ai-elements` files — 9,609 LOC — are unreachable**, including `voice-selector`,
   `test-results`, `stack-trace`, `schema-display`, `commit`, `file-tree`, `web-preview`, `sandbox`,
   `canvas`, `node`, `edge`. Delete them (git history keeps them recoverable).
2. **Drop the dependencies they alone pulled in** — `@xyflow/react`, `media-chrome`, `shiki`,
   `@rive-app/react-webgl2`, `react-jsx-parser`, `tokenlens`, `ansi-to-react`, `use-stick-to-bottom`,
   and the `@streamdown/*` add-ons if they stay unreferenced. Verified as having zero importers
   outside the dead set.
3. **Bundle analysis** in CI with a size budget that fails the build on regression.
4. **Images.** `@next/next/no-img-element` is disabled and remote thumbnails (SerpAPI, Yahoo) render
   as raw `<img>`. Move to `next/image` with `remotePatterns`, then re-enable the rule.
5. **Caching** — `unstable_cache`/`revalidateTag` for thread lists, memories, and subscription
   status; a static shell for the chat route.
6. **Streaming SSR / Suspense boundaries** so the sidebar and thread list do not block first paint.
7. **Time-to-first-token budget** — measure and optimize the pre-LLM work: today a turn does an
   ownership `SELECT`, a Polar API call, a memory read, _and_ a parallel `gpt-5-nano` extraction call
   before tokens flow. (Phase D item 3 removes the Polar call.)

### Exit criteria

- [ ] Codebase under ~13k LOC with identical functionality.
- [ ] Bundle budget enforced in CI; measured reduction recorded here.
- [ ] Lighthouse ≥ 95 performance / ≥ 95 a11y on the chat route.
- [ ] p95 time-to-first-token recorded before and after.

### Phase E status

> **`NOT DONE`** — Not started.

---

## Phase F — Conversation data completion

**Goal:** finish what Phase A started — the app doesn't just _write_ its conversation data, it
_reads_, searches, and exports it.
**Risk:** medium. **Touches:** `app/(chat)/chat/[thread_id]/page.tsx`, `server/chat/chat-service.ts`,
`server/db/`, sidebar.

This is the remainder of the original Phase 3. The infrastructure — table, indexes, repositories,
pagination, HTTP routes — all shipped in Phase A. What is left is the read switch and the
user-facing features built on top of it.

### Work

1. **Switch the read to the `message` table** (carried-forward item 4). `getThreadHistory`
   (`server/chat/chat-service.ts:107`) still calls `agent.getState` and maps LangGraph checkpoint
   messages. `listMessages` in `server/db/message-repository.ts` already exists and is already
   keyset-paginated; the page just doesn't call it. Switch it, keep the checkpoint as agent state
   only, and verify against threads written before and after the dual-write started.
2. **History pagination in the UI.** Once reading from `message`, the thread page loads a window
   with "load earlier" instead of the entire conversation into the server component.
3. **Full-text search across a user's messages.** Postgres `tsvector` column on `message.parts` text
   content with a GIN index, exposed as `GET /api/threads/search` or a query param on the existing
   threads route.
4. **Archive and pin UI.** The columns, the repository methods, and the `PATCH` route all exist from
   Phase A; nothing in the interface calls them. Add the sidebar affordances and an archived view
   (the non-partial thread index exists precisely to serve it).
5. **Data rights** — export a conversation (JSON / Markdown), and delete an account with a full
   cascade across `thread`, `message`, checkpoints, `store`, `store_vectors`, and the Clerk user.

### Exit criteria

- [ ] The thread page reads from `message`, not from checkpoints.
- [ ] Opening a 500-message thread loads a window, not the whole history.
- [ ] Thread search returns hits, and `EXPLAIN` shows the GIN index in use.
- [ ] Archive and pin are reachable from the sidebar.
- [ ] Account deletion leaves no orphaned rows in any of the six tables.

### Phase F status

> **`NOT DONE`** — Not started.

---

## Phase G — Chat experience completeness

**Goal:** remove every dead control and close the table-stakes gaps against a top-tier chat product.
**Risk:** medium. **Touches:** `components/chat/`, `store/chat-store.ts`, `app/api/chat/`.

Depends on Phase F: resumable streams need the message table to be the read path.

### Work

1. **Stop / abort.** There is no stop button anywhere and no abort path — a runaway generation
   cannot be cancelled and keeps billing. Add stop to the composer, propagate the abort signal
   through the route into the graph, and persist the partial message.
2. **Resumable streams.** Refreshing mid-answer loses the response permanently. Persist stream state
   and reattach on reload.
3. **One-transaction turn persistence** (carried-forward item 2). The user turn is written before the
   model runs and the assistant turn from the graph node, in separate transactions, because the
   assistant turn is produced inside a stream that outlives the request. The stream-lifecycle work in
   items 1 and 2 is what makes a single transaction possible.
4. **Per-thread chat instance.** `store/chat-store.ts` creates a **single module-level `Chat`
   instance** shared by every thread, with a module-level `fallbackThreadId` reused for the whole
   session, and `ChatShell` clobbers `messages` via `setMessages` on every navigation. Key the chat
   instance by thread id so switching threads mid-stream cannot cross-contaminate.
5. **Wire the dead controls** — the `+` attachment button in `components/chat/chat-composer.tsx` has
   an `aria-label` and no handler; the Retry action in `components/custom/message-renderer.tsx` is
   `onClick={() => {}}`. Either implement (attachments: image/PDF upload → vision models; retry:
   `regenerate()`) or remove. Shipping controls that do nothing is worse than not shipping them.
6. **LLM-generated thread titles.** `deriveThreadTitle` truncates the first message at 30 chars.
   Generate a real title from the first exchange with a cheap model, streamed in after the fact.
7. **Message-level features** — edit & resend, branch/fork a conversation, per-message model
   attribution, token cost display, regenerate with a different model. (`message.model_id`,
   `input_tokens`, and `output_tokens` are already persisted per message from Phase A.)
8. **Streaming polish** — the artificial `▍` cursor appended to text in the renderer, typing
   indicator, and tool-call progress should come from real stream state; render reasoning parts
   (currently dropped by the converter — see Phase C item 8).
9. **Empty/loading/error states** consistent across sidebar, memories, and profile. Note
   `app/(chat)/profile/page.tsx` divides by `creditedUnits` without a zero guard → `NaN%` on a fresh
   account.

### Exit criteria

- [ ] Stop cancels the stream, persists the partial answer, stops billing.
- [ ] Refresh mid-stream resumes the same answer.
- [ ] A turn's two messages commit in one transaction.
- [ ] No control in the UI is a no-op.
- [ ] Rapidly switching threads mid-stream never mixes messages.

### Phase G status

> **`NOT DONE`** — Not started.

---

## Phase H — Observability and reliability

**Goal:** any failed request is explainable from a single request id, and cost is visible per user
and per model.
**Risk:** low-medium. **Touches:** `instrumentation.ts`, `server/lib/`, provider call sites.

**Partially started.** Item 5 landed early, out of order, during the billing incident.

### Work

1. **OpenTelemetry** via `instrumentation.ts` — spans for route → graph node → LLM call → tool call,
   carrying the existing `requestId` / `llmCallId` / `userId` / `modelId` as attributes. The logger
   already emits these fields; make them trace attributes too.
2. **Error tracking** (Sentry or equivalent) with source maps, `requestId` correlation, and
   `AppError.code` as the grouping key. Explicitly do not capture `AppError` 4xx as incidents.
3. **LangSmith tracing** for the agent graph — prompt/response/tool visibility during incidents.
4. **Resilience on provider calls** — timeouts, bounded retries with jittered backoff, and a circuit
   breaker per provider that degrades to a fallback model instead of failing the turn. `llmCall`
   currently logs and rethrows with no retry.
5. ✅ **Health & readiness** — `/api/health` (liveness) and `GET /api/health?deep=1` (DB + Polar
   billing readiness). **Shipped during the billing incident**, ahead of this phase.
6. **Cost dashboard** — the structured logs already carry input/output/total tokens per call, and
   Phase A persists them per message. Ship queries + a dashboard for spend per user, per model, per
   day, with an anomaly alert.
7. **SLOs and alerts** — chat p95 time-to-first-token, stream error rate, 5xx rate, and Polar ingest
   failure rate, each with a paging threshold.

### Exit criteria

- [ ] A user-reported request id resolves to a full trace: route span → graph → LLM → tool.
- [ ] A provider outage degrades to a fallback model instead of a 500.
- [ ] Daily spend per user is queryable and alerting on anomalies.
- [x] A deep health probe reports DB and billing readiness.

### Phase H status

> **`WIP`** — item 5 shipped early during the billing incident (`GET /api/health?deep=1`, plus
> `pnpm polar:doctor`). Items 1–4, 6, and 7 are not started.

---

## Phase I — Test depth

**Goal:** the risky paths (auth, ownership, model access, quota, streaming) are covered by tests
that actually exercise them.
**Risk:** low. **Touches:** `tests/`, CI.

### Work

1. **A Clerk session fixture** (`clerk-testing` skill) — the blocker for carried-forward item 1, and
   the prerequisite for everything else in this phase.
2. **Integration tests for route handlers** against an ephemeral Postgres (Testcontainers or a CI
   service container): anonymous → 401, foreign thread → 403, missing thread → 404, Pro model without
   a subscription → 403, malformed body → 400 with issues, over quota → 429. Phase A verified 401 /
   400 / 200 by hand; the ownership paths have never been tested through a real authenticated call.
3. **Service-layer tests** with a real DB — `ensureThreadAccess`, `getThreadHistory`, `listMemories`,
   subscription checks against a mocked Polar.
4. **Contract tests** — every tool's Zod schema round-trips through the transport shape the renderer
   parses (locks the Phase C contract).
5. **E2E with Playwright** — sign in, send a message, see it stream, see a tool card render, stop a
   stream, switch threads, hit the upgrade flow. Run against a seeded DB with recorded provider
   fixtures so it is deterministic and free.
6. **Coverage gates in CI** — thresholds on `server/` and `lib/` specifically, not a global average
   that dead UI code can dilute. (Cleaner after Phase E deletes that code.)
7. **Load test** — a k6/Artillery scenario for concurrent streams, asserting the Phase D limits.

### Exit criteria

- [ ] Every `AppError` code has a test that produces it through a real route call.
- [ ] E2E suite green in CI on every PR.
- [ ] Coverage gate enforced for `server/` and `lib/`.

### Phase I status

> **`NOT DONE`** — Not started.

---

## Phase J — Product surface and polish

**Goal:** the thing a stranger lands on is as considered as the thing a user logs into.
**Risk:** low. **Touches:** new public routes, theming, a11y, docs.

### Work

1. **Public landing + pricing.** `/` currently sits inside `(chat)` behind `auth.protect()` — there
   is no marketing surface at all, and no way to see pricing before signing up. Add a public landing,
   a pricing page driven by `MODEL_REGISTRY` tiers, and move the app to `/app`.
2. **SEO** — `robots.ts`, `sitemap.ts`, per-route metadata, JSON-LD. (Metadata/OG are already solid
   in `app/layout.tsx`; the routes to index simply do not exist yet. Note that OG URLs are currently
   wrong in production — see Deployment state item 1.)
3. **Resolve the theme contradiction.** `app/layout.tsx` hardcodes `className="dark"` on `<html>`
   while `ThemeProvider` is configured with `enableSystem`, so the system setting can never win.
   Either ship a real light theme (tokenized, both themes audited for contrast) or drop
   `enableSystem` and commit to dark. Decide, then make the code say so. **Careful:** A3 established
   that `next-themes` rewrites the `<html>` className and strips font variables; keep them on
   `<body>` alongside `font-sans`.
4. **Accessibility pass** — fix the two `jsx-a11y/role-has-required-aria-props` warnings, add
   `aria-live` announcements for streaming responses, full keyboard navigation, visible focus rings,
   and reduced-motion support across the glassmorphism animations. (A3 already handles
   `prefers-reduced-motion` on the auth screens.)
5. **Onboarding** — first-run tour, model-picker explanation, memory explainer with a consent moment
   (the app stores durable personal facts and never asks).
6. **Command palette** (`cmdk` is already a dependency) — thread switching, model switching, new
   chat, search (needs Phase F item 3).
7. **Clerk visual integration** (carried-forward item 6) — revisit if `@clerk/ui` v2 applies
   `appearance.elements`, or accept the CSS-scoped approach as final.
8. **Docs** — `ARCHITECTURE.md`, `CONTRIBUTING.md`, `docs/adr/` for the real decisions (LangGraph
   over raw AI SDK; Polar over Stripe; Clerk over Better Auth; social-only auth; checkpoints vs. an
   owned message table), and `docs/runbook.md` for on-call.

### Exit criteria

- [ ] Public landing and pricing are indexable and pass Lighthouse SEO.
- [ ] Theme behavior matches its configuration.
- [ ] axe-core reports zero violations on every route.
- [ ] A new contributor can go from clone to running app using only the docs.

### Phase J status

> **`NOT DONE`** — Not started.

---

# Decisions and incidents

Not phases. Recorded because they constrain the code and are not visible from it.

---

## Social-only authentication

**Decision (owner, 2026-09-09):** Google, GitHub, and LinkedIn are the only ways into the product.
No email, no password, no verification codes.

### What this buys

- **No credential surface.** The app never receives, transmits, or stores a password, and there is
  no password-reset flow to attack. Phase D's auth-hardening work shrinks accordingly: password
  policy and reset-flow abuse simply do not apply.
- **Verified email for free.** Every identity arrives from a provider that has already verified the
  address, so `emailVerified` is meaningful without this app sending a single email.
- **No transactional email dependency.** No provider to configure, no deliverability to monitor.

### What it costs, and what to watch

- **Provider outage is total lockout.** With one method there is no fallback; with three there is,
  but only if a user has more than one. Clerk's account linking matches identities by verified email,
  so a user who signs in with Google today and GitHub tomorrow lands on the same account when the
  addresses match. Worth confirming that setting is on in the dashboard.
- **Anyone without one of the three is excluded.** Fine for a developer product where GitHub and
  Google are near-universal; it would not be for a general consumer audience.
- **The LinkedIn mark is the weakest signal** of the three in a developer context. If sign-in
  conversion is ever measured, that is the one to watch.

### Code implications, applied

- Deleted the `cl-dividerLine`, `cl-dividerText`, `cl-formFieldInput`, `cl-formFieldLabel`, and
  `cl-formButtonPrimary` rules from `app/globals.css`. Confirmed against the live DOM that Clerk
  renders none of those elements under a social-only configuration.
- The email/password styling written "just in case" was deleted rather than carried as speculative
  code.
- `server/auth/user-service.ts` keeps its `@placeholder.invalid` email fallback. Under social-only
  every identity carries a verified address, so the fallback should never fire — it stays because the
  foreign key must hold even if a provider ever returns an unexpected payload.
- Clerk's own arrangement of the buttons is left alone: the last-used provider gets a labelled
  full-width button and the others sit beside it as marks. Forcing all three to labelled block
  buttons needs `layout.socialButtonsVariant`, which is **not on the `Appearance` type in
  `@clerk/ui` v1** and does not typecheck. Available on request via CSS generated content, but that
  hardcodes provider names in a stylesheet and was not worth the trade.

---

## Billing incident — 2026-09-09

**`COMPLETED`** · Production checkout returned `502 UPSTREAM_ERROR`. Reproduced against Polar
directly, first through the SDK and then with raw HTTP to rule out the SDK's environment mapping.

**Cause:** the `POLAR_ACCESS_TOKEN` was expired or revoked. `401 invalid_token` on _both_
`sandbox-api.polar.sh` and `api.polar.sh`, and on a plain read-only product list — so not a checkout
bug and not an environment mismatch. The credential itself was dead.

**Configuration decision (owner):** this deployment runs `POLAR_SERVER=sandbox` even on the live
site. Supported, and normal before launch — sandbox takes test cards only and moves no real money.
Switching to `production` is a three-value change (server, token, product id), never one.

### Fixed as a result

| Problem                                                                                                                                            | Fix                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POLAR_SERVER` defaulted to `"sandbox"` when unset, so a production deploy missing the var silently sent production credentials to the sandbox API | Required explicitly when `NODE_ENV=production`; the error names the consequence                                                                                         |
| A revoked token and a malformed request both surfaced as one opaque 502                                                                            | `upstreamStatus`, `upstreamCode`, `upstreamDetail`, `polarServer`, and `credentialFailure` are now structured log fields, so `invalid_token` is greppable and alertable |
| Credential failure told users to "try again", which can never work                                                                                 | Credential failures return `SERVICE_UNAVAILABLE` with an honest message; request failures keep `UPSTREAM_ERROR`                                                         |
| `customerEmail: ""` was sent when Clerk had no primary address — Polar rejects it as a validation error                                            | Field omitted when empty                                                                                                                                                |
| A dead billing credential was invisible until a customer tried to pay                                                                              | `pnpm polar:doctor`, plus an opt-in `GET /api/health?deep=1` billing probe for a low-frequency monitor                                                                  |

The env guard immediately proved itself by breaking the local build (`pnpm build` runs under
`NODE_ENV=production` with no `POLAR_SERVER` declared). Resolved by declaring `POLAR_SERVER=sandbox`
in `.env` rather than weakening the guard — development genuinely is sandbox, and now the file says
so.

### Follow-up: the guard blocked deploys

The `POLAR_SERVER` guard was enforced at **module load**, and Next evaluates modules during
`next build` page-data collection — so it failed the Vercel build, not just the runtime. That was an
overreach: a build talks to nothing and needs only `NEXT_PUBLIC_*` values, which are inlined into the
client bundle.

Enforcement now skips when `NEXT_PHASE === "phase-production-build"` and applies everywhere else, so
a bad config fails the deployment's **first request** instead of never shipping. Verified across all
three cases: runtime+production+missing throws, build+missing passes, runtime+production+set passes.

The policy moved to `lib/env-policy.ts` as a pure function. Writing the test surfaced why:
`lib/env.ts` validates as an import side effect and throws on an incomplete environment, so anything
importing it — including its own test — inherits that crash.

**Trade-off, stated plainly:** a misconfigured deploy now goes live and fails its first request
rather than failing the build. Build-time enforcement catches it earlier, but only when the build
environment carries every runtime secret, which is not a property worth requiring of a build.
`pnpm polar:doctor` and `GET /api/health?deep=1` are the intended pre-deploy checks. Say so if you
would rather have the build blocked instead.

### Resolution

Three things had to land together, which is why it took several passes:

1. **A new sandbox token** issued at `sandbox.polar.sh`, replacing the revoked one. This was the
   actual defect.
2. **`POLAR_SERVER=sandbox` set in the Vercel environment.** Required by the new guard, and genuinely
   needed at runtime regardless.
3. **The build/runtime split** described above, because the guard as first written failed the Vercel
   build rather than the runtime.

**Confirmed working in production by the owner.** `pnpm polar:doctor` passes all three checks against
the sandbox organization: token valid, product `Pro` present, product active.

> **`COMPLETED`** — root cause found (revoked token), guardrails and tooling landed, and live
> checkout confirmed working by the owner. Sandbox billing accepts test cards only; going live is a
> three-value change (server, token, product id).

---

## Deployment state

What is actually configured in production, as distinct from what the code supports. Kept here
because none of it is visible from the repository.

### Live

| Concern        | State                                                           |
| -------------- | --------------------------------------------------------------- |
| Host           | Vercel · `www.aichatwave.in`                                    |
| Auth           | Clerk, social-only (Google, GitHub, LinkedIn)                   |
| Database       | Neon (development branch — see caveat below)                    |
| Billing        | Polar **sandbox** — checkout confirmed working; test cards only |
| `POLAR_SERVER` | `sandbox`, set explicitly in Vercel                             |

### Open items

1. **`NEXT_PUBLIC_APP_URL` is not set.** The build passes without it, so this is silent: `appUrl()`
   falls back to `https://$VERCEL_URL`, the deployment-specific hostname. That value is used for the
   Polar `successUrl`, so a customer who completes checkout is redirected to
   `aichatwave-git-*.vercel.app` rather than the real domain — and for OG metadata, so social cards
   point at deployment URLs. Set it to `https://www.aichatwave.in`.
2. **`CLERK_WEBHOOK_SIGNING_SECRET` is unset**, so `/api/webhooks/clerk` returns 503. User rows still
   appear via just-in-time provisioning, but **Polar customer creation rides on `user.created`** and
   therefore never runs. Subscriptions are being keyed to Polar customers that may not exist yet.
3. **Clerk is on `pk_test_` / `sk_test_` keys.** Development instances have relaxed session behaviour
   and are not intended for a production domain.
4. **The database is a Neon development branch** that has been dropped and recreated three times
   during this work. It is not a production database, and C4's destructive-migration exemption is
   still in force. Both need to change before real users depend on their data.

Items 1 and 2 are configuration changes that can be made today and should not wait for a phase.

---

## Unplanned work log

Phases A2, A3, and the billing incident were not in the original plan. They are recorded rather than
folded into the numbered phases so this document stays an honest account of what was actually done,
in the order it happened.

| Item             | Origin                                   |
| ---------------- | ---------------------------------------- |
| A2 — Clerk       | owner request mid-Phase A                |
| A3 — Auth design | owner request after A2 shipped           |
| Social-only auth | owner decision, recorded as a constraint |
| Billing incident | production outage, diagnosed and fixed   |

---

## Verification at last update

**2026-09-09:** `pnpm typecheck` clean · `pnpm lint` 0 errors, 5 warnings · **45 tests passing** ·
`pnpm build` exit 0 · `pnpm polar:doctor` 3/3 pass.

**2026-09-10 (restructure):** documentation only, no code changed. Phase status claims re-verified
against the working tree — schema indexes, ten route handlers, absent CI, absent error pages, absent
`instrumentation.ts`, `RATE_LIMITED` still unthrown, no `QUOTA_EXCEEDED` code, `getThreadHistory`
still reading LangGraph state, `.env.example` present but gitignored.

**2026-09-10 (Phase B):** every gate step run individually and confirmed `exit=0` —
`format:check`, `lint` (0 errors, 5 warnings, the pre-existing baseline), `typecheck`,
`test` (**52 passing**, up from 45), `build`. gitleaks 8.30.1 clean over 48 commits.
Error boundary and 404 page confirmed in a browser against a production build, with the
digest matching between the page, the clipboard, and the server log line.

Not yet observed: the GitHub Actions run itself. That is the one thing standing between
Phase B and `COMPLETED`.
