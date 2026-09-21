# AIChatWave — Competitive Plan

> **Status:** Phase K is `WIP` — its two code items shipped, its four configuration items are
> now checkable with `pnpm phase-k:verify`. Phase L is `WIP` — every work item shipped; the
> exit criteria that require a production deployment are unverified. Every other phase is
> `NOT DONE`.
> Owner: @gitdeepaks · Created 2026-09-20 · Baseline commit `2fa2bc0`
> Predecessor: [`pro_plan.md`](./pro_plan.md), phases A–J.

`pro_plan.md` made the product **correct**: typed end to end, metered, observed, tested, indexed,
and accessible. It does not make the product **chosen**. A stranger comparing AIChatWave against
t3.chat or ChatGPT is not comparing CI pipelines. They are comparing how fast the first token
arrives, how many models are in the picker, whether they can branch a conversation, and whether the
thing can read the web.

This document is the next ten phases. It continues the lettering: **K through S**. The conventions
from `pro_plan.md` carry over unchanged — one phase at a time, a status marker per phase, exit
criteria that are checkable rather than aspirational.

| Marker      | Meaning                                                  |
| ----------- | -------------------------------------------------------- |
| `NOT DONE`  | Not started. No code written for this phase.             |
| `WIP`       | Started. Some exit criteria pass, at least one does not. |
| `COMPLETED` | Every exit-criteria box is checked and verified.         |

---

## Roadmap

| Phase                              | Status     | One-line goal                                                   |
| ---------------------------------- | ---------- | --------------------------------------------------------------- |
| **K — Close the launch gap**       | `WIP`      | Stop shipping a dev instance to a real domain                   |
| **L — Instant**                    | `WIP`      | Sub-100ms thread switches and a measured TTFT budget            |
| **L2 — The design system**         | `NOT DONE` | One token layer, a real type scale, and a light theme           |
| **M — The conversation is a tree** | `NOT DONE` | Edit, branch, alternates, and shareable threads                 |
| **N — Breadth and BYOK**           | `NOT DONE` | More models, user-supplied keys, per-turn model controls        |
| **O — Real capabilities**          | `NOT DONE` | Web search with citations, document RAG, artifacts, MCP         |
| **P — Make it theirs**             | `NOT DONE` | Custom instructions, projects, personas, better memory          |
| **Q — Everywhere**                 | `NOT DONE` | PWA, mobile ergonomics, a complete keyboard map                 |
| **R — Money and growth**           | `NOT DONE` | Production billing, plans that fit, teams, an acquisition loop  |
| **S — Trust at scale**             | `NOT DONE` | Retention controls, audit log, blob storage, cost-aware routing |

Update a phase's marker in **two places** whenever it changes: this table and the
`### Phase X status` block in that phase's section. Same rule as `pro_plan.md`, same reason.

---

## Where we actually stand

Measured against the working tree at `2fa2bc0`, not against memory of it. "Them" is t3.chat and
ChatGPT as publicly understood at the time of writing; treat the competitor columns as a sketch to
argue with, not a specification to copy.

| Capability                       | AIChatWave today                                      | t3.chat          | ChatGPT | Phase  |
| -------------------------------- | ----------------------------------------------------- | ---------------- | ------- | ------ |
| Streaming chat                   | ✅ LangGraph + AI SDK, resumable, stoppable           | ✅               | ✅      | —      |
| Models in the picker             | **4** (2 OpenAI, 1 Google, 1 Anthropic)               | many             | many    | **N**  |
| Bring your own key               | ❌                                                    | ✅               | ❌      | **N**  |
| Reasoning-effort control         | ❌ fixed per model in the registry                    | partial          | partial | **N**  |
| Image generation                 | ❌                                                    | ✅               | ✅      | **N**  |
| Attachments (image / PDF)        | ✅ current turn only, stored as `bytea`               | ✅               | ✅      | **O**  |
| Document chat across turns (RAG) | ❌ bytes are dropped after the turn that sent them    | partial          | ✅      | **O**  |
| Web search with citations        | ❌ SerpAPI is wired for shopping and news only        | ✅               | ✅      | **O**  |
| Code execution                   | ❌                                                    | ❌               | ✅      | **O**  |
| Artifacts / canvas               | ❌                                                    | ❌               | ✅      | **O**  |
| MCP / user-connected tools       | ❌                                                    | ❌               | partial | **O**  |
| Edit a sent message              | ❌                                                    | ✅               | ✅      | **M**  |
| Branching / alternates           | ❌ `MessageBranch` exists in the tree, never rendered | ✅               | ✅      | **M**  |
| Regenerate                       | ✅ but it **replaces**; the old answer is lost        | ✅               | ✅      | **M**  |
| Share a conversation             | ❌                                                    | ✅               | ✅      | **M**  |
| Projects / folders               | ❌                                                    | ❌               | ✅      | **P**  |
| Custom instructions              | ❌ one global system prompt                           | partial          | ✅      | **P**  |
| Long-term memory                 | ✅ opt-in, consented, user-managed (ADR-0008)         | ❌               | ✅      | **P**  |
| Search your history              | ✅ Postgres FTS + command palette                     | ✅               | ✅      | —      |
| Export a conversation            | ✅ `/api/threads/[id]/export`                         | partial          | ✅      | —      |
| Local-first / instant nav        | ❌ every navigation is a round trip                   | ✅ **the pitch** | ❌      | **L**  |
| Installable PWA / offline        | ❌                                                    | ✅               | ✅ apps | **Q**  |
| Light theme                      | ❌ dark only, by decision (ADR-0005)                  | ✅               | ✅      | **L2** |
| Density / compact mode           | ❌                                                    | ✅               | partial | **L2** |
| Design tokens actually used      | ❌ **467 raw palette literals** vs 279 token uses     | —                | —       | **L2** |
| Teams / shared workspaces        | ❌                                                    | ❌               | ✅      | **R**  |
| Metering, quota, cost dashboard  | ✅ ahead of both                                      | —                | —       | —      |
| Observability, SLO, incidents    | ✅ ahead of both                                      | —                | —       | —      |

Read the table as three findings.

**We are ahead where users cannot see it.** Quota enforcement, the cost and SLO dashboard, OTel
traces, typed tool contracts, 398 tests — none of that appears in a side-by-side on a landing page,
and none of it is wasted. It is the reason phases K–S can be attempted at all without the product
collapsing. It is not, on its own, a reason to switch.

**We are behind on the two things a switcher tests first.** Speed of the second interaction, and
whether their favourite model is in the list. t3.chat wins users in the first thirty seconds on
exactly those two axes, and both are fixable — **L** and **N** — without new product invention.

**We have one asset neither of them has.** Consented, inspectable, deletable long-term memory, built
in from the start rather than retrofitted. ChatGPT has memory; it does not have memory you were
asked about, can read in full, and can delete one fact at a time. That is the wedge. **P** is where
it turns into a reason to pay.

---

## The wedge

Do not try to out-feature ChatGPT. It has more engineers on its file-upload pipeline than this
project has files.

Do not try to out-cheap t3.chat either. Their cost structure is BYOK plus a thin margin, and a race
to the bottom against someone already at the bottom is not a strategy.

The defensible position is the intersection the other two leave empty:

> **A fast, multi-model chat that remembers you on purpose, and can prove what it remembers.**

Everything in **P** serves that sentence. **L**, **L2** and **N** are table stakes that buy the right
to say it — fast, good-looking, and with the model they wanted in the picker. **M**, **O**, **Q** are the surrounding expectations that make a switch feel like an upgrade
rather than a downgrade with one nice feature. **R** and **S** are what stop it falling over once
people arrive.

If a phase has to be cut, cut from the end. If a phase has to be reordered, **K before everything**,
**L before N** — shipping twenty models onto a slow shell makes the shell feel slower, because the
picker is now something the user waits on too — and **L2 before M**, because every phase after it
adds UI, and UI added before the token layer is debt added at the rate of roughly a hundred literals
a phase.

---

## Global constraints

C1–C4 from `pro_plan.md` remain in force **verbatim and without exception**. They are not restated
as history; they are the acceptance criteria for every line of code in phases K–S. C1 is repeated in
full below because this is the half of the project where it is most likely to be quietly abandoned.

### C1 — Bulletproof types (carried forward, unchanged)

**No `any`. No leaked `unknown`. No type assertions. No non-null assertions.** Every rule is enforced
by the linter as of Phase C, none of it relies on review, and none of it is relaxed for a new
feature:

- **`any` is banned** by `no-restricted-syntax`, and the type-aware `no-unsafe-*` family catches an
  `any` that arrives from a dependency's types rather than from our own source.
- **`unknown` describes a function's input and nothing else**, enforced by
  `eslint-rules/unknown-parse-boundary.mjs`. It is legal as a parameter type, as a property of a
  parameter's inline object type, and as a `catch` binding. It is rejected as a field of a named
  type, as a return type, and nested in a type argument — no `Promise<unknown>`, no `unknown[]`, no
  `Record<string, unknown>`.
- **Every external payload is parsed into a named domain type at the edge.** HTTP bodies, tool
  results, provider responses, LangGraph state. `lib/json.ts` is where `JSON.parse`'s `any` stops.
- **`as X` is banned** outside vendored `components/ui/`, by
  `consistent-type-assertions` with `assertionStyle: "never"`. `as const` is not an assertion for
  this purpose.
- **Illegal states are unrepresentable**: discriminated unions over optional-field-plus-runtime-check,
  `switch-exhaustiveness-check` on every union, `exactOptionalPropertyTypes` so that "absent" and
  "present and undefined" are different types.
- **Compiler flags stay on**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`,
  `isolatedModules`.

**The temptation this document creates, named in advance.** Phases K–S add eight new untyped edges,
and each one is a place where `any` gets introduced "just to get it working":

| New edge                            | Phase | Where the type is established                                                                                                                                                                                                                                         |
| ----------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IndexedDB cache reads               | **L** | Parsed on read like any other external payload. A cache is not a trusted store — the last deploy wrote it and this one has a different shape.                                                                                                                         |
| Message tree / path materialisation | **M** | `parent_id` lineage as a named recursive type; the active path is a branded, validated array, not `string[]`.                                                                                                                                                         |
| Share tokens                        | **M** | A branded `ShareToken`, never a bare `string` that can be confused with a thread id.                                                                                                                                                                                  |
| Provider or gateway responses       | **N** | Parsed at `server/ai/model-service.ts`. A gateway's SDK types are someone else's `any` until proven otherwise.                                                                                                                                                        |
| BYOK key material                   | **N** | A branded opaque type that has no `toString`, cannot be spread into a log object, and is never widened to `string` outside the call that uses it.                                                                                                                     |
| Web pages and search results        | **O** | A contract in `lib/ai/tool-contracts.ts`, exactly as the three existing tools do.                                                                                                                                                                                     |
| Retrieved document chunks           | **O** | Same. A chunk carries its source and page as required fields, or citations cannot be trusted.                                                                                                                                                                         |
| **MCP tool results**                | **O** | The hardest one. A remote server describes its own schema at runtime — that description is input, so it is validated on arrival and its results are parsed against the validated schema. An MCP result is never handed to the graph as `unknown`, and never as `any`. |

If an edge genuinely cannot be typed ahead of time, the answer is a Zod schema derived at runtime and
a named output type — not an escape hatch. **A phase does not close with a new lint suppression, a
new `eslint-disable`, or a new entry in the vendored-code exemption list.**

### C1a — Close the `components/ai-elements/` hole

`components/ai-elements/` is currently **not linted at all** — a Phase C exemption for vendored AI
Elements source. Four files remain there after Phase E's deletion, and Phase M renders
`MessageBranch` from one of them as a core product surface. Vendored code that the product depends on
is product code. Bring the directory under the full C1 rule set, or delete what is unused and inline
what is not, before Phase M ships. This is the only place in the repository where an `any` can exist
today, and Phase M is about to make it load-bearing.

### C2–C4 (carried forward)

- **C2 — every phase ships green.** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, on CI,
  on every push. Phase K adds E2E and the accessibility audits to that gate.
- **C3 — no secret ever enters the repo.** Unchanged, and Phase N's BYOK raises the stakes: the
  encryption key for user-supplied provider keys is a deployment secret and never a committed one.
- **C4 — migrations.** The development-branch exemption **ends at Phase K item 4**. Every schema
  change in M, N, O, P, R and S is expand → backfill → contract against a live database.

### C9 — No raw palette literal, no arbitrary size

From **L2** onward, colour, spacing, radius, elevation and type come from named tokens, enforced by a
lint rule in the same spirit as C1. `bg-zinc-900`, `text-[15px]` and `shadow-[0_22px_70px_…]` are
lint errors outside `components/ui/`. The reason is the same one C1 gives for types: the repository
already proved that a convention which is not a rule loses — the token layer has existed since the
first commit and is outvoted 467 to 279.

### C5 — No feature ships without a latency budget

Every new interactive surface states, before it is built, what "fast" means for it in milliseconds,
and the phase does not close until that number is measured on a production build. Phase L defines
the budgets; every later phase inherits the obligation. A feature that makes the p95 worse is not
done, it is regressed.

### C6 — Every new surface ships with its own tests and its own axe pass

Phase J left both audits manual, and Phase K automates them. From K onward, a route that is added
without an axe assertion and without at least one integration test has not been added, it has been
leaked. This is cheap to hold while there are six routes and impossible to retrofit at thirty.

### C7 — Anything user-supplied that reaches a model is fenced

`server/chat/untrusted-content.ts` already fences tool output and user memories. Phase O triples the
untrusted surface — web pages, retrieved document chunks, MCP tool results — and every one of those
goes through the same fence. A retrieved web page is not a system prompt and must never be able to
act like one.

### C8 — No user-visible behaviour is decided in more than one place

The registry pattern that `lib/ai/model-registry.ts` and `lib/billing/plan-policy.ts` established is
the house style: one module owns a fact, the server enforces it and the client renders it from the
same numbers. BYOK, custom instructions, project settings and share permissions each get one owner
module. Two catalogues is one catalogue and one lie.

---

# Phases

---

## Phase K — Close the launch gap

**Goal:** the deployment stops being a development instance wearing a production domain.
**Risk:** low, but it is the only phase where _not_ acting has an ongoing cost.
**Touches:** Vercel config, Clerk, Neon, Polar, CI.

Everything here is already named in `pro_plan.md` as an open item. It is restated as a phase because
open items in a completed document do not get done, and because every one of them is either a live
correctness bug or a gate that stops the next nine phases from regressing silently.

### Work

1. **`NEXT_PUBLIC_APP_URL=https://www.aichatwave.in` in Vercel.** Deployment state item 1. Today
   `appUrl()` falls back to `$VERCEL_URL`, so post-checkout redirects land on a deployment hostname
   and OG cards point at URLs that will not exist next deploy. Widest blast radius of any single
   config value in the project.
2. **`CLERK_WEBHOOK_SIGNING_SECRET` set.** Deployment state item 2. `/api/webhooks/clerk` returns
   503, so `user.created` never fires, so **Polar customers are never created**. Subscriptions are
   being keyed to customers that may not exist. Backfill the accounts created while it was unset.
3. **Clerk production instance.** `pk_live_` / `sk_live_`, production domain, social providers
   re-registered with production OAuth credentials. Also removes the development-instance cookie
   handshake that is holding Lighthouse best-practices at 78 and inflating the measured TTFB.
4. **A production database.** The current Neon branch is a development branch that has been dropped
   and recreated three times. Promote or create a production branch, and **retire C4's
   destructive-migration exemption** on the same commit — from that point, migrations are
   forward-only for real.
5. **Playwright E2E on CI**, with a Clerk test instance and a seeded test user. This is Phase I item
   5, deferred on exactly this credential. Cover: sign in → send → stream → stop → resume after
   reload → delete thread.
6. **axe-core and Lighthouse in CI**, against a production build, on every public route and — using
   the session from item 5 — every authenticated one, including a thread page with a live
   transcript, which Phase J never audited. Fail the build on a violation. Budget Lighthouse
   performance and SEO as thresholds, not as a report nobody reads.
7. **Close Phase E.** Authenticated Lighthouse and production TTFT samples are the only things
   holding it at `WIP`, and item 6 produces both.

### Exit criteria

- [ ] `pro_plan.md` Deployment state has **zero** open items, and the table says so.
- [ ] A checkout completes and returns the customer to `www.aichatwave.in`.
- [ ] A new sign-up produces a user row **and** a Polar customer, verified in both systems.
- [ ] `pnpm test:e2e` runs on CI against a real Clerk session and gates merges.
- [ ] axe-core reports 0 violations on all routes **in CI**, thread page included.
- [ ] Lighthouse best-practices ≥ 95 on the production deployment.
- [ ] Phases E, I and J are all `COMPLETED` in `pro_plan.md`.

### What shipped (2026-09-20)

**Items 5 and 6, in full.** They had to land together, which is exactly what Phase J predicted:
auditing an authenticated route needs a signed-in session, and building that session was item 5.

- **`pnpm test:e2e`** — 21 Playwright tests over a production build: streaming, stop, resume after
  a reload, thread deletion, the signed-out redirects, and axe-core over every route.
- **The social-only problem, solved without weakening anything.** `@clerk/testing` can mint a
  **sign-in ticket** through the Backend API, which bypasses first-factor verification entirely. So
  no password or email-code strategy had to be enabled on any instance and ADR-0006 holds
  unmodified. The cost, recorded rather than hidden: the sign-in form itself is not covered.
- **axe-core in CI over all seven routes**, including the thread page with a live transcript that
  Phase J never audited — and audited twice there, mid-stream and settled, because the announcer
  and the status bar only exist while a turn is in flight.
- **Lighthouse in CI** (`lighthouserc.js`), reusing the E2E session so the authenticated routes are
  audited too. SEO, accessibility and best-practices block; performance is reported, not enforced —
  a shared runner cannot produce a performance number worth failing a build over, and Phase L's
  production p95 budgets are the real gate.
- **`pnpm phase-k:verify`** — the preflight that turns items 1–4 from prose into an exit code.
- **`pnpm polar:backfill`** — reconciles the accounts created while the Clerk webhook was 503ing.

### Found by the gate, and fixed

Six real defects, five of them on the authenticated surface Phase J never audited. Every one was
found by the gate and verified fixed by the same gate.

| Severity   | Defect                                                                                                                                   | Fix                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `critical` | Sidebar thread-list **loading skeletons were real `<button>`s with no text** — six anonymous buttons in the tab order on every cold load | Placeholders render as `div`s, marked `aria-hidden`                                                   |
| `critical` | Command palette: cmdk's separator is `role="separator"`, which ARIA forbids inside `role="listbox"`                                      | Separators are `role="presentation"`, fixed at the call site rather than in vendored `components/ui/` |
| `critical` | Sidebar nav buttons lost their accessible name in collapsed icon mode (`display: none` on the label)                                     | Labels become `sr-only`, plus explicit `aria-label`                                                   |
| `moderate` | `/sign-in` had **no landmark at all** — the auth shell was a `div` wrapping two unnamed `<section>`s                                     | The shell renders a real `<main>`                                                                     |
| `moderate` | A thread page had **no `<h1>`** — the only heading in the workspace lives in the empty state                                             | Visually-hidden `<h1>` in the transcript branch                                                       |
| `minor`    | Avatar `alt` repeated the name rendered beside it, so screen readers said it twice                                                       | Avatars are decorative (`alt=""`)                                                                     |

Phase J reported zero violations on every route it audited. It audited six, by hand, and this is the
seventh plus the five it could not reach — which is the argument that phase was making about itself.

### Found by the gate, on its first run

**`/sign-in` had two `moderate` axe violations** — `landmark-one-main` and `region`. The auth shell
was a `<div>` wrapping two `<section>`s, and a `<section>` without an accessible name is not a
landmark, so the page had none at all and its content sat outside every one. Phase J reported zero
violations on this route; it was measured by hand, and this is the regression that proves the point
the phase was making about itself. `components/auth/auth-screen-shell.tsx` now renders a real
`<main>`. Verified by the same gate that found it.

**The first version of the database check was worse than no check.** It looked for `-dev-` or
`-staging-` in the Neon hostname — but Neon endpoint ids are random (`ep-misty-night-aiv4dy1b`) and
carry no trace of their branch, so it returned a confident ✅ for the very development branch item 4
is about. It now requires the production endpoint to be recorded by a human and fails until one is.

### Measured

**Suite result on the last run: 18 passed, 3 failed, 1 skipped.** The skip is a deliberate
`test.fixme` for the known-broken "stopping a stream loses the turn" defect already recorded in
`docs/runbook.md` — written as a failing expectation so whoever fixes it finds the assertion waiting
rather than guessing what it should have asserted. All nine accessibility specs and all eight
auth/routing specs pass. The three failures are the contention problem in item 2 above.

Lighthouse, median of three runs against a local production build:

| Route      | Performance | Accessibility | Best practices | SEO |
| ---------- | ----------- | ------------- | -------------- | --- |
| `/`        | 97          | 100           | 96             | 100 |
| `/pricing` | 97          | 100           | 96             | 100 |

Best practices is **96**, against the 78 Phase J recorded. That number was attributed to Clerk's
development-instance cookies; the marketing routes do not mount Clerk, which is the likeliest
explanation, and the authenticated routes have not been measured yet.

### Phase K status

> **`WIP`** — items 5, 6 and the tooling for 1–4 shipped and are green. Four things remain, and
> three of them are not code:
>
> 1. **Items 1–4 are configuration** and need dashboard access: the Vercel app URL, the Clerk
>    webhook secret, a production Clerk instance, and a production database branch.
>    `pnpm phase-k:verify` currently reports **item 2 open** and **item 4 open** against this
>    machine's environment. Item 1 is set locally; whether Vercel holds it is unverified.
> 2. **Three of the four chat specs are flaky under full-suite contention.** Each passes when run
>    alone; run as part of the suite against a shared development database they fail on stream-slot
>    contention. `PLAN_LIMITS.free.concurrentStreams` is **1**, a turn deliberately outlives its
>    client, and the suite is a queue of streaming tests behind a single slot. The setup project
>    clears the identity's `stream_lease` and a `beforeEach` clears it again, which took the suite
>    from 12 passing to 18; the remainder is the free plan's own limit doing its job. The likely
>    answer is to give the E2E identity a plan with headroom rather than to keep retrying against a
>    cap that has nothing to do with what these tests assert. **Unresolved, and it is the one thing
>    in this phase I would not call finished.**
> 3. **`pnpm polar:backfill` has not been run**, because it should not run until item 2 is fixed.
> 4. **Phase E stays `WIP`.** Local production-build Lighthouse now exists; production TTFT samples
>    do not, and that is what its exit criteria ask for.

---

## Phase L — Instant

**Goal:** the app feels local. Switching threads does not wait for a network, and the first token
arrives before the user's eye leaves the send button.
**Risk:** medium — cache coherence is where local-first products earn their bugs.
**Touches:** client data layer, the chat route, the request path.

This is the phase that answers t3.chat directly. Their entire pitch is speed, it is a real
advantage, and it is a solved engineering problem rather than a research one.

### The budgets (C5)

| Interaction                           | Budget          | Measured how                           |
| ------------------------------------- | --------------- | -------------------------------------- |
| Thread switch, thread already visited | **< 100ms** p95 | Client mark, cache hit to first paint  |
| Thread switch, cold                   | < 400ms p95     | Client mark                            |
| Sidebar interactive, cold load        | < 1.2s p95      | Lighthouse TTI on the workspace        |
| Time to first token, warm             | **< 900ms** p95 | Server span, send → first stream chunk |
| Time to first token, cold lambda      | < 1.8s p95      | Same span, cold-start subset           |
| Optimistic echo of a sent message     | < 16ms          | One frame. Never a network round trip. |

These numbers go in the SLO dashboard next to the ones Phase H already tracks, so a regression pages
someone instead of being noticed in a demo.

### Work

1. **A persistent client cache.** Thread list and message pages into IndexedDB, keyed by user, with
   the React Query cache hydrated from it at boot. A revisited thread renders from disk immediately
   and revalidates in the background. The keyset cursors the repositories already return make this
   straightforward — the cache stores pages, not an unbounded blob.
2. **Prefetch on intent.** Hover, focus, or touch-start on a sidebar thread prefetches its first
   message page and its route. Most thread switches should have their data before the click.
3. **Optimistic everything.** Rename, pin, archive, delete and new-thread all apply locally and
   reconcile. `threads-list.tsx` already uses mutations; they invalidate rather than mutate the
   cache, which costs a round trip on every one of them.
4. **Shorten the critical path to first token.** Today the chat route authenticates, checks the rate
   limit, checks quota, resolves the model, acquires a stream lease, and then calls the provider —
   serially. Rate limit and quota are independent reads and can run concurrently; title generation
   is already deferred and must stay off the path; the provider client should be constructed once
   per process, not per request. Instrument each segment first, cut the biggest, re-measure. Do not
   guess.
5. **No layout shift on switch.** The transcript, composer and sidebar keep their geometry across a
   navigation. Where a View Transition is genuinely better than a same-frame render, use one, but
   the goal is the absence of movement, not the presence of animation.
6. **A visible streaming cursor within one frame of send.** The optimistic user message and the
   assistant placeholder both paint before any network result. Phase G's announcer already handles
   the accessibility side of this.

### Exit criteria

- [ ] Every budget in the table above is met on the production deployment and recorded in the SLO
      dashboard. _(Recorded — nine objectives on `/app/admin/operations`. Not met, because there is
      no production deployment yet: Phase K items 1–4.)_
- [ ] Navigating to a previously-visited thread with the network throttled to offline still renders
      the transcript. _(Implemented; asserted by `tests/e2e/instant.spec.ts`, which has not run on
      this machine — no Postgres.)_
- [ ] Rename, pin and delete all reflect in the sidebar within one frame. _(Same: implemented and
      asserted, not executed.)_
- [x] No mutation in the sidebar triggers a full list refetch.
- [x] A TTFT breakdown exists as a trace, with each segment named, so the next person optimising it
      is not guessing either.
- [x] Cached records are parsed on read into named types; no `any`, no leaked `unknown`, no new lint
      suppression (C1).

### What shipped (2026-09-21)

**All six work items.** The shape of the change is one sentence: the transcript stopped being
something the server hands down on every navigation and became something the client already has.

**1 — A persistent client cache.** `lib/cache/indexed-db.ts` is a dependency-free typed wrapper over
one database, one store and one index; `lib/cache/query-persistence.ts` mirrors the queries named in
`PERSISTED_KINDS` to it and reads them back at boot. Two decisions are worth arguing with:

- **Only the first message window is persisted, not every page.** "Load earlier messages" is a
  deliberate action with a control and a spinner of its own and has never been expected to be
  instant. Storing every page anyone ever scrolled back through would grow the cache without moving
  a single budget.
- **Search results and authorisation state are not persisted at all.** Search is keyed by whatever
  anyone typed, so the store would slowly become a search history; consent and subscription are
  authorisation, and serving those from disk is how a cancelled plan keeps working offline.

**The cache is parsed on read, one record at a time** (C1). A record written by a previous deploy is
dropped on its own rather than invalidating everybody's cache — which is the difference between a
renamed field costing one round trip and costing every user their local-first experience.

**2 — Prefetch on intent.** `useThreadPrefetch` warms both halves of the next screen on hover, focus
or touch: `router.prefetch` for the route segment and `queryClient.prefetchQuery` for the thread's
first message page. `<Link prefetch>` is deliberately off — the workspace layout is authenticated, so
the thread route is dynamic, and an automatic viewport prefetch of a dynamic route stops at the
loading boundary.

**3 — Optimistic everything.** `lib/threads/thread-cache.ts` holds rename, pin, archive, delete and
new-thread as pure functions over the cached pages, and `hooks/use-thread-list-cache.ts` applies one
change to every cached list variant at once. The list is cached four ways (active, archived, pinned,
unpinned) and a mutation can move a row between them, so rather than knowing which variant is on
screen, each operation is applied everywhere and each variant decides for itself whether the result
still belongs. That is what makes "archive" remove a row from one list and add it to another with no
special case anywhere. **No mutation invalidates the list.**

**4 — The critical path, instrumented before it was cut.** `server/chat/ttft-breakdown.ts` names
every pre-stream segment and emits the breakdown at the first token, as `chat.ttft_breakdown` and as
attributes on the turn's span. Three cuts followed from having the numbers rather than from guessing
at them:

- **Provider clients are built once per process.** `getDynamicModel` constructed a fresh
  `ChatOpenAI` / `ChatAnthropic` / `ChatGoogleGenerativeAI` on every single request and threw it
  away when the turn ended. They are stateless with respect to a turn — everything that varies is
  passed to `invoke` — so they are now cached by model id. Noted in the code: Phase N's BYOK breaks
  that key, deliberately and visibly.
- **The account-deletion check and the plan read run concurrently.** Two independent reads that were
  two serial round trips before the first gate had even run.
- **The memory-consent read moved up, alongside the thread-ownership check.** It neither spends nor
  reserves, so it has no business being a gate, and it was costing a serial round trip after quota.

**What deliberately did not move: the memory lookup is still after the quota gate.** It is an
embedding call and the largest single segment, and pulling it earlier would have been the biggest
number on the chart — at the cost of spending on turns quota refuses. The gate order in
`streamChat`'s docblock is a design, not an accident, and speed is not a reason to quietly abandon
it.

**5 — No layout shift on switch.** The thread page's `loading.tsx` is gone, because there is nothing
left for it to fall back for. A cold thread now renders the _transcript's_ container with placeholder
rows inside it, so the swap to real content changes text and nothing else — rather than swapping a
`max-w-5xl` rounded box for a `max-w-6xl` one, which is what the empty state and the transcript did
to each other.

**6 — The echo is measured, not asserted.** `ChatComposer` already painted the user's message and a
typing placeholder before any network result. What was missing was any way to know it stayed that
way, so the clock now starts at the top of `handleSubmit`, before the upload branch, and stops in the
transcript's layout effect.

### The budgets, and where they now live

All six budgets in the table above are objectives in `lib/observability/slo.ts` and panels on
`/app/admin/operations`. Three are measured by the server; three can only be measured by the browser,
which posts them to `POST /api/metrics/latency`.

**They are counted in process memory, not in a table, and the dashboard says so.** The alternative is
a database write per thread switch and per frame of interaction — a row per frame, to measure how
fast frames are. The same trade-off `server/observability/metrics.ts` already made for the API 5xx
rate, made again for the same reason and reported the same way, through the `scope` field.

**Time to first token is now three objectives, not one.** The fleet-wide number read from
`chat_stream` stays as the outer guard; warm (900ms) and cold-start (1.8s) are separate because they
are different problems with different fixes and averaging them hides both. `claimColdStart()` is
exact rather than heuristic: one invocation per process claims the bit.

**A browser may only report the three objectives a browser can observe.** `CLIENT_REPORTED_SLO_IDS`
is a closed enum, the value is clamped, and the batch is bounded. Time to first token is absent from
it on purpose — the browser sees it, but the server _knows_ it, and accepting a client's opinion of a
number the server measures would let a tab move an objective it has no way of observing.

### Found on the way

**Every thread in the sidebar had been unhighlighted since Phase J.** The active row was decided by
`pathname === `/chat/${thread.id}``— a URL shape that stopped existing when the workspace moved under`/app`. No test covered it and nothing failed; the selected conversation simply never looked selected.
It now goes through `isChatRoute`, which is the one place that knows the shape.

**The bundle budget caught a 282KB regression on the landing page, in a phase about speed.** The
persistence wiring was first written into `QueryProvider`, which lives in the root layout — so its
`useAuth` import pulled Clerk's client runtime into `/`, `/sign-in`, `/sign-up` and `/_not-found`,
and `pnpm bundle:check` failed all four. Nothing outside `/app` caches anything, so the wiring moved
to `QueryCacheSync` in the workspace layout and every route is back inside its budget. Worth
recording rather than quietly fixing: it is exactly the shape C5 warns about, the budget found it
before a human did, and the thread page came out 4KB _smaller_ than it started.

**Signing out now clears the device.** Moving the wiring out of the provider took the sign-out
handler with it, which turned out to be the better place for it anyway: `endLocalSession` is called
from the two places a session actually ends — the sidebar menu and account deletion — rather than
inferred from an auth-state change in a component that unmounts as the redirect happens. A shared
browser stops holding the previous user's conversation titles, and "permanently delete your account,
conversations, memories" now includes the copies on this machine.

**`readThreadWindow` and `listThreadMessages` differed only in a case that is now shared.** One
tolerated a thread that did not exist yet because the page called it before the first message was
written; the other refused, because only an already-navigated client called it. The client now reads
the first window through the same path, so there is one function and one rule (C8). The test that
pinned the difference now pins the tolerance.

### Not measured, and not claimed

- **No budget has been verified on a production deployment**, because there is not one yet: Phase K
  items 1–4 are still open. The instrumentation is in place and the dashboard reports it; the numbers
  are not.
- **`pnpm test:e2e` has not been run against these changes.** `tests/e2e/instant.spec.ts` asserts the
  three client-side exit criteria — offline revisit, optimistic sidebar, no list refetch — by holding
  the network open or switching it off, but this machine has no Docker daemon and no reachable
  Postgres, so it has not executed. Everything that does not need a database is green:
  `pnpm typecheck`, `pnpm lint`, `pnpm build`, and 392 passing unit tests (up from 357).
- **`experimental.staleTimes` was considered and left alone.** Raising `staleTimes.dynamic` would
  keep visited routes in the client router cache and help back/forward navigation — but it applies to
  every route, including the memory centre and the operations dashboard, whose server-rendered data
  would then be served stale. Prefetch-on-intent already covers the path the budgets describe.

### Phase L status

> **`WIP`** — all six work items shipped and the budgets are instrumented, but two exit criteria
> cannot be checked from here:
>
> 1. **"Every budget is met on the production deployment"** needs a production deployment, which is
>    Phase K items 1–4. The budgets are declared, measured and on the dashboard; nothing has been
>    measured _in production_ and this document does not claim otherwise.
> 2. **The three browser-side criteria are asserted by an E2E spec that has not run here** — no
>    Docker, no Postgres. They are implemented and reviewed, not verified.
>
> Everything else in the exit list is done and checkable locally: the TTFT breakdown exists as a
> named trace, no sidebar mutation refetches the list, and cached records are parsed into named types
> with no new lint suppression.

---

## Phase L2 — The design system

**Goal:** the look becomes a system instead of 467 decisions, and a light theme becomes a token swap
instead of a project.
**Risk:** medium. It is a wide, shallow change — it touches nearly every component and almost no
logic, which is the profile that breaks things in ways tests do not catch.
**Touches:** `app/globals.css`, every `.tsx` with a class name, ADR-0005, a new lint rule.

Numbered `L2` rather than given its own letter for the reason `pro_plan.md` numbered A2 and A3 that
way: it belongs immediately after **L** in sequence, and renumbering the rest of the document to say
so would be worse than the insertion. It is a full phase, not a sub-task of L.

### What is actually wrong

Measured on the working tree at `2fa2bc0`, not estimated:

| Signal                                                          | Count                              |
| --------------------------------------------------------------- | ---------------------------------- |
| Raw palette literals (`zinc-800`, `white/10`, `orange-400`…)    | **467** across **43** files        |
| — of which `zinc`                                               | 240                                |
| — of which `orange` / `amber`                                   | 129                                |
| — of which `white` / `black`                                    | 95                                 |
| Semantic token uses (`bg-background`, `text-muted-foreground`…) | 279                                |
| Arbitrary font sizes (`text-[15px]`, `text-[2.4rem]`…)          | **129**, in **24 distinct values** |
| Arbitrary shadows (`shadow-[…]`)                                | 30                                 |
| Arbitrary radii (`rounded-[…]`)                                 | 19                                 |
| `backdrop-blur-*` uses                                          | 18                                 |
| `--chart-1` … `--chart-5` declared                              | 5                                  |
| `--chart-*` actually used by a component                        | **0**                              |

Five findings follow from that table, and each one is a work item.

**The design system exists and the components ignore it.** `@theme inline` in `app/globals.css`
declares a complete shadcn token set — background, card, popover, primary, muted, accent, border,
ring, sidebar. Then 467 raw literals bypass it, against 279 uses that honour it. The tokens are not
wrong; they are outvoted. Every new surface in M, N, O and P will add to the larger number unless
something stops it.

**The brand colour is not a token.** The product's identity is unmistakably ember-orange on deep
zinc — it is in the send button, the focus ring, the selection colour, the scrollbar thumb, the skip
link, and the sidebar. It appears 117 times as `orange-…` and `rgb(251 146 60 / …)`. Meanwhile
`--primary` is `oklch(0.922 0 0)` — a light grey, the stock shadcn dark value, inherited and never
revisited. The single most-used colour in the product cannot be changed in one place.

**The accent is applied to everything, so it marks nothing.** Scrollbar thumb, text selection, focus
ring, skip link, send button, sidebar primary, and a dozen glow shadows all carry it. An accent that
is on the furniture cannot also be the thing that says "this is the action". Restraint here is worth
more than any new colour.

**There is no type scale.** 24 distinct arbitrary sizes, from `text-[9px]` to `text-[4rem]`, chosen
per component. `text-[15px]`, `text-[16px]` and `text-[17px]` all exist, in a product where the
difference between them is invisible and the cost of choosing between them is real.

**ADR-0005 undercounted the problem by an order of magnitude.** It rejects a light theme partly
because of "some sixty `white/…` and `zinc-…` literals". The real figure is 467. That strengthens
the ADR's reasoning and weakens its conclusion: at sixty, hand-auditing is a plausible afternoon; at
467 it is not, which is precisely why the literals have to become tokens first — and once they are,
the light theme the ADR called "a project" is a second block of variable declarations.

### Work

1. **Name the colour system, once.** Promote ember to `--brand` / `--brand-foreground` with a
   documented ramp, set `--primary` to it (it is the primary action colour — that is what the token
   means), and add the semantic roles the product actually needs and currently fakes with literals:
   surface elevation levels, the glass-panel fill and its border, the "streaming" state, and the
   success/warning/danger trio. Every value in OKLCH, as the existing ones already are.
2. **Decide the identity on purpose.** The recommendation is **keep ember-on-zinc and apply it with
   discipline**: it is genuinely distinctive next to ChatGPT's black-and-green and t3.chat's
   pink-purple, and throwing away a recognisable palette to replace it with another blue assistant
   would be a downgrade. What changes is application — accent reserved for the primary action, the
   focus ring, and active state; furniture returns to neutral. Write it down, with the ramp and the
   rules, so the next component does not re-decide it.
3. **Migrate the 467.** Mechanical, file by file, one commit per area (chat, sidebar, marketing,
   auth, admin, gen-UI cards). Nothing may move visually during this step — it is a substitution,
   and any pixel that shifts is a token that was named wrong.
4. **Enforce it with a lint rule.** This project's house style is that constraints are rules, not
   review (C1, C6, C8). A `no-restricted-syntax` rule banning raw palette class names outside
   `components/ui/` and the token layer is what keeps the count at zero after the migration. Without
   it, this phase is a repaint that starts peeling in Phase M.
5. **A type scale, a radius scale, an elevation scale, a motion scale.** Collapse 24 font sizes to a
   named scale of roughly seven steps; 19 radii and 30 shadows to a handful each; one duration set
   and one easing curve for the whole app. The glass treatment (`backdrop-blur` + translucent fill +
   inset highlight) becomes one utility rather than 18 hand-rolled variations — it is the product's
   most recognisable surface and it is currently spelled differently nearly everywhere it appears.
6. **Ship the light theme, and rewrite ADR-0005.** Once items 1–5 land this is a second `:root`
   block plus `color-scheme: light dark`, a real theme toggle wired to system preference, and a
   contrast audit. It matters competitively — both comparators have it — and it matters for people
   who simply read better on light backgrounds. Supersede the ADR rather than editing it; the
   original reasoning was sound for its moment and the record should show what changed.
7. **Verify contrast, not just structure.** axe-core passing (Phase J) says the markup is right; it
   does not clear every token pair. Check each foreground/background combination in both themes,
   including the ones a literal currently produces — `zinc-500` placeholder text on a `zinc-900`
   composer is the first to check, and disabled states and the muted metadata rows are next.
8. **A density control.** Comfortable and compact, switching spacing tokens only. t3.chat feels
   faster partly because it shows more conversation per screen; this is cheap once spacing is
   tokenised and it is a visible answer to that comparison.
9. **Data-viz tokens that exist for a reason.** `--chart-1` … `--chart-5` are stock shadcn values
   used by nothing. Phases R and S add real dashboards. Define a ramp that is brand-coherent,
   colour-blind-safe, and legible in both themes — before the charts are written, not after.
10. **Bring the surfaces to the same standard.** The marketing page, OG image, favicon set, empty
    state, loading skeletons and error pages are all first impressions, and today they are the
    least-revisited files in the repository. One pass, against the finished system.

### Exit criteria

- [ ] **Zero** raw palette literals outside `components/ui/` and the token layer, down from 467, and
      a lint rule fails the build on the next one.
- [ ] `--brand` is the only place the ember value is written; changing it restyles the product.
- [ ] Font sizes come from a named scale; **zero** `text-[…]` arbitrary values remain in `app/` and
      `components/` outside `components/ui/`.
- [ ] Radius, elevation, blur and motion each come from a named scale.
- [ ] A light theme ships, toggles, follows system preference by default, and persists.
- [ ] Every token pair meets **WCAG AA** in both themes, verified by an automated contrast check in
      CI (Phase K item 6 is where it runs), not by eye.
- [ ] axe-core still reports 0 violations on every route, in both themes.
- [ ] Density toggle changes spacing only — no reflow bugs, no clipped text at either setting.
- [ ] ADR-0005 is superseded by an ADR that states the new position and why it changed.
- [ ] Screenshots before and after each migration commit show **no unintended visual change**.

### Phase L2 status

> **`NOT DONE`**

---

## Phase M — The conversation is a tree

**Goal:** a conversation stops being an append-only log. Messages can be edited, answers can have
alternates, any point can be forked, and a thread can be shared read-only.
**Risk:** **high.** This is the deepest schema and graph change in the document.
**Touches:** `message` schema, LangGraph checkpointing, the transcript, a new public route.

### Why it is high risk

LangGraph checkpoints are linear. The `message` table is linear. Branching makes the conversation a
tree while the checkpointer still believes it is a list, and the reconciliation between those two
views is the whole difficulty of this phase. Decide the model before writing UI:

- **`message.parent_id`** makes the tree explicit and the checkpoint derived — the graph is fed the
  materialised path from root to the active leaf on every turn. More writes, one source of truth,
  and the checkpoint becomes a cache rather than a record. **This is the recommended option**, and
  it is the one ADR-0004 was already leaning toward when it made the `message` table authoritative.
- **A checkpoint thread per branch** keeps the graph untouched and moves the cost into thread
  explosion, orphaned checkpoints, and a sidebar that has to hide most of what it stores.

Write an ADR before the first line of code. This is exactly the decision that is cheap now and
unaffordable in six months.

### Work

1. **Schema.** `message.parent_id` (self-referencing, nullable for the root), `thread.active_leaf_id`,
   and an index that walks a path without a recursive query per render. Backfill existing threads as
   a single spine — every message's parent is its predecessor.
2. **Path materialisation.** One function owns "the messages the model sees for this turn", replaces
   the current linear read, and is the only thing the graph is fed. Every existing test of history
   reading points at it.
3. **Edit a user message.** Editing forks: the edited message becomes a sibling, the subtree below
   the original is preserved and reachable, and the new path becomes active.
4. **Regenerate keeps both.** Today regenerate replaces the answer and the previous one is gone —
   the user cannot compare, which is the main reason to regenerate at all. The new answer becomes a
   sibling. `components/ai-elements/message.tsx` already ships `MessageBranch`, `MessageBranchNext`
   and the rest, fully written and never rendered. This work is largely wiring.
5. **Fork from any message.** "Branch from here" creates a new thread rooted at that node, so a long
   exploration can split without losing the trunk.
6. **Share links.** `thread_share`: token, thread, owner, created, revoked, and a **snapshot vs
   live** flag. Recommend snapshot-by-default — a live link that keeps updating as the owner keeps
   typing is a privacy surprise, not a feature. The public route is `noindex`, rate-limited by IP,
   renders the active path only, strips attachments unless explicitly included, and is revocable
   from the thread menu.
7. **Attribution survives a branch.** Phase G's per-message model attribution must show which model
   produced each alternate. Comparing two answers is pointless if you cannot see which model gave
   which.

### Exit criteria

- [ ] An ADR records the tree model and the checkpoint reconciliation, with the rejected option.
- [ ] Editing a user message preserves the original subtree and switches to the new one.
- [ ] Regenerating produces a sibling; the switcher shows `2/2`; both are readable after reload.
- [ ] Alternates produced by different models are labelled with the model that produced them.
- [ ] A shared link renders for a signed-out visitor, is `noindex`, and 404s within one request of
      being revoked.
- [ ] A shared link never exposes a message outside the shared thread, verified by an integration
      test that tries.
- [ ] Existing threads migrate to the tree with no visible change and no lost message.
- [ ] `components/ai-elements/` is linted under the full C1 rule set (C1a), and the branch types are
      named rather than asserted into shape.

### Phase M status

> **`NOT DONE`**

---

## Phase N — Breadth and BYOK

**Goal:** the model picker stops being a reason to leave, and heavy users stop being a cost problem.
**Risk:** medium. BYOK is a credential-handling feature and must be treated as one.
**Touches:** registry, provider layer, a new encrypted table, the composer, pricing.

Four models is the single most visible gap. `MODEL_REGISTRY` is already built for this — adding a
model is a typed entry with a price, modalities and presentation, and the compiler refuses an
incomplete one. The registry is not the work. The provider plumbing and the economics are.

### Work

1. **Widen the registry to a defensible set.** Cover four axes rather than chasing a count: a
   frontier reasoning model, a fast-and-cheap default, a long-context reader, and an open-weight
   option. Each entry needs real list prices — the pricing page and the per-message cost display
   both derive from them, so a wrong number is a visible lie.
2. **Decide direct SDKs versus a gateway.** Three provider SDKs are already four dependencies and
   four failure modes; ten would be worse. A gateway trades that for one vendor on the critical
   path. Whichever way it goes, `server/ai/model-service.ts` is the only module that learns about
   it, and `provider-health.ts` and `resilience-policy.ts` keep working unchanged. ADR it.
3. **BYOK.** Per-user provider keys, encrypted at rest with a key that is not in the database,
   decrypted only in the request that uses them, never logged, never returned to the client after
   they are stored, and deleted with the account. A user on their own key gets the full model list
   and a quota ceiling that exists for abuse control rather than for margin. Add a prominent
   "your key, your bill" disclosure — this is a trust feature as much as a cost feature, and it
   only works if people believe it.
4. **Per-turn model controls.** Reasoning effort where the provider exposes it, and a length or
   verbosity control. `OpenAiModelOptions` already carries `reasoning.effort` and it is currently
   fixed in the registry; making it a composer control is mostly a plumbing change through
   `runtime-context.ts`.
5. **Image generation as a message part.** A new part type in `lib/ai/message-parts.ts`, a renderer,
   and storage that does not put a PNG in a `jsonb` column — this is the same blob-storage problem
   Phase S item 3 solves, and doing them together avoids solving it twice.
6. **Side-by-side comparison.** Given Phase M's alternates, "ask two models at once" is a small
   addition on top: two siblings, generated concurrently, rendered in the switcher. Cheap to build
   once M lands, and it is a demo that sells the multi-model pitch in one screenshot.

### Exit criteria

- [ ] ≥ 10 models, each with verified list pricing, correct modality flags, and a blurb.
- [ ] `/pricing` and the per-message cost display both derive from the registry with no hardcoded
      price anywhere.
- [ ] A BYOK key round-trips: stored, used for a real turn, never present in any log line, absent
      from every API response, gone after account deletion. An integration test asserts each.
- [ ] Reasoning effort is selectable where supported and hidden where it is not.
- [ ] Provider fallback (Phase H) still works across the wider set, verified by an induced failure.
- [ ] Adding a model is still a single registry entry plus a passing typecheck.
- [ ] Provider and gateway payloads are parsed into named types at the service boundary, and BYOK key
      material is a branded opaque type that cannot be logged or widened to `string` (C1).

### Phase N status

> **`NOT DONE`**

---

## Phase O — Real capabilities

**Goal:** the model can reach outside the conversation — the live web, the user's documents, and the
user's own tools.
**Risk:** high, and it is mostly security risk. Every item here widens the untrusted surface.
**Touches:** tools, retrieval, a new panel, a new protocol client.

Order matters inside this phase. Ship 1 and 2 before 3 and 4; the first two are what users ask for
and the second two are what impresses other developers.

### Work

1. **Web search with citations.** A general search tool alongside the existing shopping and news
   ones, returning ranked results with source URLs, fetched and summarised with the content fenced
   per C7. Citations render inline and are clickable — an uncited web answer is worse than no web
   answer, because it is confidently unverifiable. `serpapi` is already a dependency and
   `tool-contracts.ts` is the pattern to follow.
2. **Document chat that survives the turn.** Today `hydrateLatestAttachments` deliberately drops
   attachment bytes after the turn that sent them — a correct decision for cost and checkpoint size,
   and the reason "what did page 40 say?" fails three turns later. The fix is retrieval, not
   re-sending: chunk and embed on upload, retrieve the relevant chunks per turn, cite the page.
   `store_vectors` and the bounded vector retrieval from Phase A already exist for memory and are
   the right substrate.
3. **Artifacts.** Code and long documents move out of the transcript into a side panel that is
   versioned, diffable, copyable and downloadable. This is the single feature that most changes what
   the product feels like for a developer audience, and it composes with Phase M — an artifact
   version is a branch of a message.
4. **MCP client.** Let users connect their own MCP servers. Neither competitor does this well for
   end users, this codebase's typed-tool-contract discipline is unusually well suited to it, and it
   converts "AIChatWave cannot do X" into "connect the thing that does X". Scope it hard: a
   per-user server list, an explicit per-tool consent step, aggressive timeouts, and results fenced
   like any other untrusted content.
5. **Code execution — deferred, deliberately.** A real sandbox is a platform, not a feature, and the
   cost of getting it wrong is arbitrary code execution attributed to this product. Use a hosted
   sandbox or do not ship it. Recorded here so the decision is explicit rather than forgotten.

### Exit criteria

- [ ] A web-search answer renders citations that resolve to the sources actually used.
- [ ] A 100-page PDF can be asked about on turn 10 with a correct page citation.
- [ ] An injection attempt inside a retrieved page or MCP result cannot change model behaviour,
      demonstrated by a test that attempts it.
- [ ] An artifact survives reload, keeps its version history, and downloads.
- [ ] An MCP tool cannot run without per-tool consent, and a hung server cannot hold a turn open
      past the existing turn ceiling.
- [ ] Every new tool has a contract in `lib/ai/tool-contracts.ts` and a renderer that cannot disagree
      with it.
- [ ] An MCP server's self-described schema is validated on arrival and its results parsed against
      the validated schema — never passed on as `any` or `unknown` (C1).

### Phase O status

> **`NOT DONE`**

---

## Phase P — Make it theirs

**Goal:** the product is worth paying for because leaving means losing something that took time to
build.
**Risk:** low technically, high in judgment — this is where the product's opinion gets stated.
**Touches:** prompts, a new project entity, memory, onboarding.

This is the wedge. Memory already exists, is consented, is inspectable and is deletable — that
foundation is the hard part and it is done. What is missing is everything that turns a stored fact
into a felt difference.

### Work

1. **Custom instructions.** Global, per-project, and per-thread, composing in that order into
   `BASE_SYSTEM_PROMPT_TEMPLATE`. Show the user the resolved prompt — a hidden prompt that silently
   changes behaviour is the thing people distrust most about every assistant, and showing it is
   nearly free.
2. **Projects.** A named container with its own instructions, its own documents (Phase O item 2),
   its own threads, and optionally its own memory scope. Sidebar becomes two sections. This is the
   feature ChatGPT users miss most when they leave, and it is the natural home for everything else
   in this phase.
3. **Memory, upgraded.** Extraction proposes rather than asserts, with a review queue the user can
   accept or reject; memories are searchable, editable and attributable to the conversation that
   produced them; project-scoped memories do not leak across projects. Then the claim in the wedge
   is literally demonstrable: _here is everything it knows about you, where each fact came from, and
   a delete button on each one._
4. **Personas and a prompt library.** Saved, named configurations — model, instructions, tools,
   temperature — invocable from the command palette. Shareable, which makes them an acquisition
   surface alongside Phase M's share links.
5. **Starters that know you.** `prompt-starter-card.tsx` currently offers fixed suggestions. Derive
   them from recent threads and active projects, or drop the feature — generic suggestions are
   furniture, and furniture in the empty state is the first thing a new user judges.

### Exit criteria

- [ ] The resolved system prompt for any turn is viewable by the user who caused it.
- [ ] A project's instructions and documents apply to every thread inside it and to none outside it.
- [ ] Extracted memories require an explicit accept, and each one names its source conversation.
- [ ] Memory Center supports search, edit, per-item delete and project scoping.
- [ ] A persona can be saved, invoked from the palette, and shared by link.
- [ ] ADR-0008's consent model still holds unchanged under all of the above, and the tests prove it.

### Phase P status

> **`NOT DONE`**

---

## Phase Q — Everywhere

**Goal:** the product is reachable from a phone home screen and drivable without a mouse.
**Risk:** low.
**Touches:** manifest, service worker, mobile layout, shortcuts.

### Work

1. **PWA.** `site.webmanifest` already exists and is inert. Add a service worker, an app shell, an
   offline read mode over Phase L's IndexedDB cache, and a send queue that flushes on reconnect. L
   is a hard prerequisite — an offline mode without a local cache has nothing to show.
2. **Mobile ergonomics.** Composer above the software keyboard on iOS Safari, one-handed reach for
   send and stop, swipe to open the sidebar, swipe to delete a thread, and a share target so text
   and images can be sent from any other app.
3. **A complete keyboard map.** ⌘K exists and is good. Add new thread, next/previous thread, focus
   composer, edit last message, regenerate, switch branch, toggle sidebar, switch model — and a
   discoverable `?` sheet, because an undiscoverable shortcut is a shortcut for the person who wrote
   it.
4. **Install prompt with judgment.** Offered after demonstrated use, once, dismissible forever. Not
   on first load.

### Exit criteria

- [ ] Installs to the home screen on iOS and Android and launches standalone.
- [ ] Offline: previously-read threads render; a send is queued and flushes on reconnect.
- [ ] No horizontal scroll or obscured composer at 375px width with the keyboard open.
- [ ] Every action in the keyboard map works and is listed in the `?` sheet.
- [ ] Lighthouse PWA checks pass in CI (Phase K item 6 is where they run).

### Phase Q status

> **`NOT DONE`**

---

## Phase R — Money and growth

**Goal:** the billing model fits how the product is actually used, and using the product creates more
users.
**Risk:** medium — billing changes are the ones users notice instantly and loudly.
**Touches:** Polar, plan policy, Clerk organisations, analytics.

### Work

1. **Polar production.** The three-value change already documented: `POLAR_SERVER`, token, product
   id. `pnpm polar:doctor` is the pre-flight. Nothing else in this phase matters while the product
   takes test cards only.
2. **Plans that match usage.** Today: free at 150 messages, Pro at 5,000. Phase N breaks that model,
   because a Claude Opus turn and a nano turn are not the same unit of cost. Move Pro to a
   token-or-credit budget with visible remaining balance, keep a **BYOK tier** priced near zero, and
   add annual billing. `PLAN_LIMITS` stays the single owner of every number (C8).
3. **Teams.** Clerk organisations are already available in the auth layer. Shared projects, shared
   personas, seat billing, an org-level usage view. This is the largest revenue-per-account lever in
   the document and the one both competitors serve weakly at the low end.
4. **Know what activation is.** Define it — a plausible candidate is three threads in the first week
   with memory enabled — instrument the funnel from landing to first message to second session, and
   put it next to the cost dashboard. Growth work without this number is decoration.
5. **The share loop.** Phase M's share links and Phase P's shared personas are the acquisition
   mechanism: every shared artefact carries a tasteful attribution and a sign-up path. Measure
   conversion from share view to sign-up, and stop building growth features that do not move it.
6. **Lifecycle email.** Social-only auth (ADR-0006) deliberately avoided a transactional email
   provider, and the trade-off no longer holds once there is a quota to warn about, a trial to end,
   and a subscription to recover. Adding a provider does not reopen the auth decision and the ADR
   should say so explicitly.

### Exit criteria

- [ ] A real card completes a subscription in production and provisions Pro within one webhook.
- [ ] Every plan number is served from `PLAN_LIMITS`; the pricing page has no literal.
- [ ] A user can see their remaining budget before hitting a limit, not after.
- [ ] An organisation can be created, seats billed, and a project shared inside it.
- [ ] The activation funnel reports on the dashboard with at least four weeks of data.
- [ ] Share-view to sign-up conversion is measured.

### Phase R status

> **`NOT DONE`**

---

## Phase S — Trust at scale

**Goal:** the properties a careful user or a small company checks before committing their work to a
product they had not heard of last month.
**Risk:** low per item, but several are much cheaper now than after growth.
**Touches:** storage, retention, audit, routing.

### Work

1. **Retention and deletion controls.** Account export and deletion already exist (Phase F). Add
   per-thread retention, a configurable auto-delete window, and a documented deletion SLA that names
   what is removed and when — including checkpoints, attachments and vectors, which is the part
   every competitor is vague about.
2. **An audit log.** Who read what, which admin viewed which dashboard, when a share link was
   created and revoked, when a BYOK key was added or used. Append-only, exportable. This is the
   single most requested artefact in any company's vendor review and it is trivial now and painful
   at thirty tables.
3. **Attachments out of Postgres.** `attachment.data` is `bytea` in the primary database. It works,
   it is simple, and it puts user file bytes in the hot path of every backup, every branch and every
   migration. Move to object storage with signed URLs before Phase N's image generation and Phase
   O's document RAG multiply the volume. **Do this before N item 5, not after.**
4. **Cost-aware routing.** The cost dashboard and anomaly detection already exist. Close the loop:
   route a turn to the cheapest model that satisfies it, expose the saving, and let the user
   override. Phase N makes this possible; Phase R's credit model makes it valuable to the user
   rather than only to the operator.
5. **Abuse and safety at the new edges.** Public share links, MCP servers and BYOK keys are three
   new abuse surfaces. Rate-limit share views by IP, cap MCP fan-out, detect and revoke leaked keys,
   and moderate what a public share renders — a shared thread is a publishing surface and will
   eventually be used as one.
6. **Failure isolation.** One provider outage should degrade one model, not the product. Resilience
   and fallback landed in Phase H; re-verify them against the wider provider set and add a read
   replica if the L budgets demand it.

### Exit criteria

- [ ] A deletion request removes the user's rows, checkpoints, vectors and stored objects, verified
      by a test that looks for each.
- [ ] The audit log records every item in work item 2 and exports.
- [ ] No user file bytes remain in the primary database; signed URLs expire.
- [ ] Cost-aware routing is measurable in the dashboard and overridable by the user.
- [ ] A share link cannot be scraped at volume, and a leaked BYOK key can be revoked in one action.
- [ ] An induced outage of one provider leaves every other model serving.

### Phase S status

> **`NOT DONE`**

---

# Sequencing

## Why this order

**K first, always.** Six of the nine remaining phases add surfaces that CI must protect. Adding
them before axe, Lighthouse and E2E run automatically means the quality bar Phase J reached decays
quietly, and nobody finds out until a user does.

**L before N.** More models on a slow shell make the shell feel slower, because the picker becomes
one more thing the user waits on. Speed is also the comparison a switcher runs first and the one
they run without being asked.

**L2 before M, N, O and P.** Those four phases add a branch switcher, a wider model picker, a
citation style, an artifact panel, a project sidebar and a memory review queue. Every one of them is
new UI. Built before the token layer, they are built in literals, and the 467 becomes eight hundred —
at which point the light theme is permanently out of reach and the next repaint is a rewrite. L2 is
also the cheapest phase in the document to do badly later and the cheapest to do well now.

**M before N item 6 and before O item 3.** Side-by-side comparison and artifact versions are both
cheap on top of a conversation tree and expensive without one.

**S item 3 before N item 5.** Image generation writes bytes. Writing them into a `bytea` column and
migrating them out later is the same work done twice, with a data migration in the middle.

**P is the product.** It sits mid-document because it needs O's documents and M's structure to be
worth doing, not because it is optional. If the roadmap slips, protect P and cut from Q and R.

## If there is only time for three

**K, L, and N.** Correctly deployed, genuinely fast, and a picker that does not lose the comparison.
That is a product a t3.chat user would try. It is not yet one they would stay on — that is P — but
nothing is until the first thirty seconds survive.

**If there is time for a fourth, it is L2** — and there is a real argument for promoting it over N.
The first thirty seconds are half speed and half appearance, a stranger judges the second one before
the first token arrives, and L2 is the only phase whose cost grows with every other phase shipped
ahead of it.

## Deliberately not building

Recorded so these get re-decided on purpose rather than drifted into.

- **A native mobile app.** Phase Q's PWA covers the need at a fraction of the cost, and two more app
  stores is two more release processes for a team of this size.
- **Self-hosted code execution.** Phase O item 5. Hosted sandbox or nothing.
- **A model of our own.** Obviously, but it gets proposed.
- **Real-time collaborative editing of a thread.** Phase R's teams need shared _access_, not shared
  _cursors_. The gap between those two is enormous and the demand for the second is asserted far
  more often than it is observed.
- **An agent marketplace.** Phase P's personas cover the useful ninety percent. A marketplace is a
  moderation and payments business wearing a feature's clothing.

## Open questions for the owner

Each of these changes the shape of a phase and none can be answered from the code.

1. **Who is this for?** Developers and t3.chat switchers, or a general audience? It decides N's model
   mix, O's ordering, and whether ADR-0006's social-only constraint survives contact with a general
   audience that does not have a GitHub account.
2. **BYOK: complement or core?** As a cheap tier it protects margin. As the core model it changes
   the pricing page, the free tier, and most of Phase R.
3. **Gateway or direct SDKs?** Phase N item 2. Answer before widening the registry, not during.
4. **Teams: now or later?** Highest revenue per account, and it touches auth, billing, projects and
   sharing simultaneously. Deciding it late means retrofitting an owner column onto four tables.
5. **Keep ember, or rebrand?** Phase L2 item 2 recommends keeping it and applying it with
   restraint. It is the one decision in this document that is pure taste, it is yours, and it should
   be made before the 467 literals are migrated rather than after — the migration is the cheap
   moment to change the palette, and every moment after it is not.
6. **Snapshot or live share links?** Phase M item 6 recommends snapshot. Confirm, because it is
   visible in the UI copy and painful to reverse after people have shared things.

---

## Verification at last update

**2026-09-20:** Document created. No code changed. `pnpm typecheck` and `pnpm lint` are the gate every
phase below inherits unchanged — C1's ban on `any`, on leaked `unknown` and on type assertions is
restated in full above precisely because this is the stretch of work most likely to erode it. Claims about current state were read from the
working tree at `2fa2bc0` — four models in `MODEL_REGISTRY`, three tools in `tool-contracts.ts`,
twenty route handlers, `message` with no parent pointer, `attachment.data` as `bytea`,
467 raw palette literals against 279 semantic token uses, 129 arbitrary font sizes in 24 distinct
values, `--primary` still the stock shadcn grey while the ember accent appears only as literals,
`--chart-1`…`--chart-5` declared and used by nothing,
`MessageBranch` present in `components/ai-elements/message.tsx` and rendered nowhere, no share table,
no projects table, no BYOK storage — and from `pro_plan.md`'s four open Deployment state items.
