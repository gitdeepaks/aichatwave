# AIChatWave — Production Hardening Plan

> Status: **Phases A, A2, A3 `COMPLETED`** · next up: Phase B (CI, error pages)
> Owner: @gitdeepaks · Created 2026-09-09 · Baseline commit `9f3e93d`
>
> Execution model: **one phase at a time**. Each phase ends with an explicit exit-criteria
> checklist and a **status marker**. Do not start the next phase until the current one is
> `COMPLETED`.
>
> **Status legend** — every phase closes with one of these, and the value must match the
> progress log at the bottom of this document:
>
> | Marker      | Meaning                                                  |
> | ----------- | -------------------------------------------------------- |
> | `NOT DONE`  | Not started. No code written for this phase.             |
> | `WIP`       | Started. Some exit criteria pass, at least one does not. |
> | `COMPLETED` | Every exit-criteria box is checked and verified in CI.   |

---

## 0. Baseline assessment

Measured on the current `main` (all commands run, results recorded):

| Signal                                            | Result                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm typecheck`                                  | ✅ clean                                                                           |
| `pnpm lint`                                       | ✅ 0 errors, 5 warnings (2 a11y `treeitem`, 3 stale disable directives)            |
| `pnpm test`                                       | ✅ 29 tests, all pure unit tests                                                   |
| Source LOC (excl. `node_modules`, lockfile)       | ~22,800                                                                            |
| **Unreachable LOC in `components/ai-elements`**   | **9,609 (44 of 48 files) — 42% of the codebase**                                   |
| Route handlers                                    | 2 (`/api/chat`, `/api/auth/[...all]`)                                              |
| Integration / E2E tests                           | 0                                                                                  |
| CI pipeline                                       | none (`.github/` absent)                                                           |
| `middleware.ts`                                   | absent                                                                             |
| `instrumentation.ts`                              | absent                                                                             |
| `app/error.tsx` / `loading.tsx` / `not-found.tsx` | absent                                                                             |
| Rate limiting                                     | absent (`RATE_LIMITED` code defined at `server/lib/app-error.ts:15`, never thrown) |
| Quota enforcement                                 | absent (usage is ingested to Polar, never checked)                                 |
| Polar webhooks                                    | `webhooks` imported at `lib/auth.ts:5`, never used                                 |

### Live database snapshot (dev Neon branch, read 2026-09-09)

```
account                 7 rows      checkpoint_blobs      936 rows
session                 7 rows      checkpoint_writes     536 rows
user                    7 rows      checkpoints           401 rows
thread                 39 rows      store                  31 rows
verification            0 rows      store_vectors          31 rows
```

Extensions: `plpgsql`, `vector`. Three findings confirmed against the live schema:

- **`thread` has exactly one index — its primary key.** The sidebar's
  `where user_id = ? order by created_at desc` is a sequential scan. `session` and `account`
  both have `user_id` indexes; `thread` does not. This is the `// todo` at
  `db/schema/chat-schema.ts:13`.
- **There is no `message` table.** All 401 conversations live only inside `checkpoints` /
  `checkpoint_blobs` as opaque serialized state.
- **`store_vectors` holds 31 embeddings behind an HNSW cosine index that is never queried.**
  The embedding cost is paid on write and thrown away on read — `listMemories` calls
  `store.search(namespace)` with no query vector.

### What is already good

The recent refactors landed real structure and this plan builds **on top of** it, not over it:

- `server/` is a genuine service layer — routes and pages never touch the DB or the graph directly.
- `server/lib/app-error.ts` is a clean typed-error boundary: client-safe `message`, internal `cause`, HTTP status per code.
- `server/lib/logger.ts` is a structured JSON logger with child-context propagation, and ESLint enforces it as the only `console` boundary for `server/`, `app/api/`, `lib/`, `db/`.
- `resolveRequestId` threads a request id from the inbound header through the graph and into the `x-request-id` response header.
- `lib/ai/model-registry.ts` is a client-safe single source of truth with a pure access policy (`isModelAccessible`).
- `lib/env.ts` fails fast on invalid env at boot.
- Type assertions are already near-zero in app code — exactly **one** (`store/chat-store.ts:15`).

### The gap to "production, one of its own kind"

Nine themes, addressed by the nine phases below.

1. **Nothing gates a bad change.** No CI, no integration tests, no E2E.
2. **Types are safe but not bulletproof.** `unknown` leaks past parse boundaries (24 occurrences in one renderer); the graph's runtime context is `Partial<>`, so "a chat turn without a user id" is representable.
3. **The chat endpoint is unmetered and unthrottled.** Any authenticated user can spend unbounded provider money.
4. **Conversation data is not owned.** Messages exist only inside LangGraph checkpoint blobs — unsearchable, unexportable, unpaginated, undeletable.
5. **Chat UX has dead controls and missing table stakes.** No stop button, no resumable stream, a no-op attachment button, a no-op retry action.
6. **No observability beyond stdout.** No traces, no error tracking, no cost dashboard.
7. **42% of the codebase is unreachable**, dragging in heavy unused dependencies.
8. **No public surface.** `/` is behind auth; no landing, pricing, sitemap, or robots.
9. **Docs describe the app but not how to operate it.** No runbook, no ADRs, no `.env.example`.

---

## Global constraints (apply to every phase)

These are non-negotiable and reviewed on every PR.

### C1 — Bulletproof types

- **No `any`.** Already enforced via `no-restricted-syntax` in `eslint.config.mjs`. Keep it.
- **No type assertions.** `as X` is banned in `app/`, `server/`, `lib/`, `db/`, `store/`, `hooks/`,
  and `components/` outside `components/ui/`. Enforced by `@typescript-eslint/consistent-type-assertions`
  with `assertionStyle: "never"`. (`components/ui/` is vendored shadcn and is exempted explicitly, not implicitly.)
- **No non-null assertions** (`!`). Enforced by `@typescript-eslint/no-non-null-assertion`.
- **`unknown` is a parse-boundary-only type.** It may appear as the _input_ parameter of a Zod
  `safeParse`/guard function and nowhere else. It must never be a field type, a return type, or
  flow more than one call deep. Every external payload (HTTP body, tool result, LangGraph state,
  provider response) is parsed into a named domain type at the edge; everything inward of that
  edge is fully typed.
- **Make illegal states unrepresentable.** Prefer required fields + discriminated unions over
  optional fields plus runtime checks (see `ChatRuntimeContext` in phase 1).
- **`satisfies` over annotation** where it preserves literal inference.

### C2 — Every phase ships green

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` must pass at the end of every phase,
and from phase 0 onward that is enforced by CI on every push.

### C3 — No secret ever enters the repo

`.env*` is gitignored. Phase 0 adds a scanned `.env.example` and a CI secret-scan step.

### C4 — Migrations

**Decision (2026-09-09, owner):** the target database is a _development_ Neon branch and is
disposable. Schema work may drop and recreate rather than expand → backfill → contract. Migrations
are regenerated from a clean baseline instead of being layered onto the existing two.

This exemption is scoped to development. Before the first production deploy, C4 reverts to:
every schema change ships as a migration safe to apply to a live database, never a destructive
rewrite.

---

## Phase 0 — Guardrails and boot hygiene

**Goal:** make it impossible to merge a red build, and make a fresh clone runnable in one command.
**Risk:** low. **Touches:** config only, no product behavior.

### Work

1. **CI pipeline** — `.github/workflows/ci.yml`, on `push` + `pull_request`:
   `install → format:check → lint → typecheck → test → build`, Node 22, pnpm cache.
2. **`.env.example`** with every key, grouped by concern, with a comment on which feature each
   unlocks and which are optional.
3. **Fix env schema holes in `lib/env.ts`:**
   - `BETTER_AUTH_SECRET` is present in `.env` and used by Better Auth but is **absent from the
     schema** — a production-critical secret with no boot validation. Add it as required.
   - `POLAR_PRODUCT_ID` currently defaults to a hardcoded real product id
     (`lib/env.ts:11`). Remove the default; require it explicitly.
   - Provider keys (`GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `SERP_API_KEY`) are unconditionally
     required, so the app cannot boot without every vendor account. Make them required only when
     a model in `MODEL_REGISTRY` for that provider is enabled, via a superRefine derived from the
     registry. Keeps fail-fast, removes deployment friction.
4. **App-shell error handling** — `app/global-error.tsx`, `app/error.tsx`, `app/not-found.tsx`,
   and route-level `loading.tsx` for `(chat)`, `(chat)/chat/[thread_id]`, `(chat)/memories`.
   Error pages surface the `requestId` so a user report maps to a log line.
5. **Repo hygiene** — remove `msw` from `pnpm-workspace.yaml` `allowBuilds` (not a dependency);
   commit `docs/` structure; add `CODEOWNERS`.
6. **Secret scan** in CI (`gitleaks` or `trufflehog`) plus `git log -S` audit for historical leaks.

### Exit criteria

- [ ] CI green on `main`, red on a deliberately broken PR.
- [ ] `cp .env.example .env && pnpm install && pnpm dev` boots with only `DATABASE_URL`,
      `BETTER_AUTH_*`, and `OPENAI_API_KEY` set.
- [ ] Throwing inside a page renders `app/error.tsx` with a copyable request id.
- [ ] Secret scan clean on full history.

### Phase 0 status

> **`NOT DONE`** — Not started.

---

## Phase 1 — Bulletproof types

**Goal:** satisfy C1 mechanically, so type safety is enforced by the linter rather than by review.
**Risk:** medium (touches parsing paths). **Touches:** `app/api/chat/`, `lib/converters.ts`,
`components/custom/message-renderer.tsx`, `server/chat/`, `store/chat-store.ts`, configs.

### Work

1. **Tighten the compiler** — `tsconfig.json` gains `exactOptionalPropertyTypes`,
   `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`.
   (`strict` and `noUncheckedIndexedAccess` are already on.) Raise `target` from `ES2017`.
2. **Type-aware ESLint** — add `typescript-eslint` with `projectService`, enabling
   `no-unsafe-argument/assignment/call/member-access/return`, `no-non-null-assertion`,
   `consistent-type-assertions: never`, `switch-exhaustiveness-check`, `no-floating-promises`,
   `no-misused-promises`. Add the custom `unknown`-containment rule described in C1.
3. **A typed tool contract, shared by producer and consumer.** Today
   `server/chat/tools.ts` returns loosely shaped objects and
   `components/custom/message-renderer.tsx` re-derives them with ~24 `unknown` narrowings and
   hand-written `toNumber`/`isRecord` helpers. Replace with `lib/ai/tool-contracts.ts`:
   one Zod schema per tool (`displayProductsResultSchema`, `displayWeatherResultSchema`,
   `displayNewsResultSchema`), `z.infer` types exported. The tool returns the parsed type;
   the renderer parses the transport payload once through a discriminated union keyed on
   `toolName` and renders fully-typed props. Deletes the entire ad-hoc normalizer layer.
4. **`app/api/chat/schema.ts`** — replace `selectedModel: z.unknown()` + `superRefine` with
   `z.enum(MODEL_IDS)` derived from `MODEL_REGISTRY`. Removes the last `unknown` from the request
   boundary and gives a real Zod error instead of a custom issue.
5. **`store/chat-store.ts`** — delete the sole `as Record<string, unknown>` cast (line 15) by
   Zod-parsing the transport body into a `ChatRequestBody` type.
6. **`ChatRuntimeContext` becomes non-optional.** `server/chat/agent.ts` currently models it as
   `{ context?: Partial<ChatRuntimeContext> }` and defends with `getRuntimeString` guards, so
   `userId` reaches `ingestModelUsage` as `string | undefined` and memory silently no-ops when
   absent. Make the context required at the graph boundary: parse it once on entry into a
   `ChatRuntimeContext` (branded `UserId`, `ThreadId`, `RequestId` string types), and let every
   node take the parsed value. A turn without a user id becomes unconstructable.
7. **Typed graph state.** `server/chat/chat-service.ts:getThreadHistory` reaches into
   `state.values` through `isRecord` + `Array.isArray` + `filter(isBaseMessage)`. Wrap
   `agent.getState` in a `readThreadState()` helper that parses once and returns
   `BaseMessage[]`, so the service layer never sees `unknown`.
8. **`lib/converters.ts`** — `convertLangChainToUI` hand-narrows `StoredMessage.data`
   (6 `unknown`s) and drops reasoning parts. Rewrite schema-first over the stored-message shape,
   and preserve reasoning/tool-state fidelity.
9. **Tests for every new schema** — round-trip and rejection tests per tool contract, extending
   the existing `node:test` suite.

### Exit criteria

- [ ] `grep -rn "unknown" app server lib store db components --exclude-dir=ui --exclude-dir=ai-elements`
      returns only parse-function parameters.
- [ ] Zero `as X` assertions outside `components/ui/`.
- [ ] Type-aware lint passes with zero warnings.
- [ ] Tool payloads are typed end to end: changing a tool's return shape breaks the renderer at compile time.

### Phase 1 status

> **`NOT DONE`** — Not started.

---

## Phase 2 — Security, abuse control, and cost containment

**Goal:** an authenticated user can no longer spend unbounded provider money, and the app carries
production security headers.
**Risk:** medium-high (touches the hot path). **Touches:** `middleware.ts`, `app/api/chat/`,
`server/billing/`, `lib/auth.ts`.

### Work

1. **Rate limiting on `/api/chat`** — sliding window per user id _and_ per IP, plus a
   concurrent-stream cap (one in-flight stream per user by default). Throw the already-defined
   `AppError("RATE_LIMITED")`, return `Retry-After`. Storage: Postgres for a single-region
   deploy, or Upstash/Redis if multi-region. Surface the 429 in the composer as a clear
   "slow down" state rather than a generic toast.
2. **Quota enforcement.** Usage is ingested to Polar (`ingestModelUsage`) but **never checked** —
   `getCustomerUsageMeter` exists and is read only by the profile page. Add a pre-flight
   `assertWithinQuota(userId)` before the LLM call, with distinct free-tier and Pro limits and a
   typed `QUOTA_EXCEEDED` error code plus an upgrade CTA in the UI.
3. **Kill the per-request Polar round-trip.** `assertModelAccess` → `hasActiveSubscription` calls
   the Polar API on **every single message**, adding vendor latency and a vendor rate limit to the
   critical path, and failing closed on any Polar hiccup. Fix by wiring the **Polar webhooks
   plugin that is already imported and unused** (`lib/auth.ts:5`): persist subscription state to a
   `subscription` table on `subscription.created/updated/canceled`, read locally, and keep the API
   call only as a cold-cache fallback.
4. **`middleware.ts`** — centralized auth gate for `(chat)` routes (currently each layout/page
   redirects individually, which is easy to forget on a new route), plus security headers: strict
   CSP with nonces, HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
   `Permissions-Policy`, `X-Frame-Options`.
5. **Prompt-injection containment.** Tool outputs (SerpAPI titles, Yahoo headlines) are
   concatenated into model context. Fence tool results with explicit untrusted-content delimiters
   in the system prompt, and cap memory injection length — `getMemoriesPromptContent` currently
   injects **every** stored memory with no cap, so a long-lived account grows the system prompt
   without bound (a cost and a jailbreak surface).
6. **Auth hardening** — email verification, password policy, session rotation, account-linking
   rules, and a CSRF review of the server actions in `lib/polar.ts` / `lib/threads.ts`.
7. **Dependency & supply chain** — `pnpm audit` in CI, Dependabot/Renovate, pinned action SHAs.

### Exit criteria

- [ ] A scripted burst of 100 messages from one account returns 429s with `Retry-After`.
- [ ] A user over quota gets `QUOTA_EXCEEDED` + upgrade CTA, and no provider call is made.
- [ ] Zero Polar API calls on a warm chat request (verified in logs).
- [ ] securityheaders.com-equivalent audit at A grade; CSP has no `unsafe-inline`.

### Phase 2 status

> **`NOT DONE`** — Not started.

---

## Phase 3 — Own the conversation data

**Goal:** conversations become first-class, queryable, user-controlled data instead of opaque
checkpoint blobs.
**Risk:** high (schema + migration). **Touches:** `db/schema/`, `drizzle/`, `server/chat/`, sidebar.

### Work

1. **`message` table** — `id`, `thread_id`, `role`, `parts` (jsonb, schema-validated on write),
   `model_id`, `input_tokens`, `output_tokens`, `created_at`. LangGraph keeps the checkpoint for
   agent state; the app keeps the durable record for search, export, deletion, and pagination.
   Dual-write first, read from the new table once backfilled.
2. **Indexes.** `db/schema/chat-schema.ts:13` carries a `// todo: add index for userId` — the
   sidebar's thread list does `where(userId) order by createdAt desc` on every page load with no
   index. Add `thread(user_id, created_at desc)` and `message(thread_id, created_at)`.
3. **`thread.updatedAt` is declared and never written.** Maintain it on each message so the
   sidebar can order by real activity.
4. **Thread operations** — rename, delete (cascade to messages + checkpoints), archive, pin,
   and full-text search across a user's messages.
5. **History pagination.** `getThreadHistory` loads the _entire_ conversation into the server
   component on every thread open. Paginate (windowed load + "load earlier").
6. **Resolve the two-driver split.** `db/index.ts` uses `@neondatabase/serverless` `neon-http`
   (no transactions, no session state), while `PostgresSaver` and `PostgresStore` open their own
   `pg` connections. Pick one driver strategy; use a real pool + transactions so thread creation
   and the first message commit atomically.
7. **Move DDL out of the import path.** `server/chat/agent.ts:24` runs a module-level
   `await getStore()`, which executes `store.setup()` (DDL) at import time on every cold start.
   Move `PostgresStore`/`PostgresSaver` setup into the migration step and make the runtime
   assume the schema exists.
8. **Use the vector index that already exists.** `server/memory/store.ts` configures 1536-dim
   OpenAI embeddings and a pgvector index, but `listMemories` calls `store.search(namespace)`
   with **no query** and injects everything — the embeddings are paid for and never used for
   retrieval. Switch prompt injection to top-K semantic retrieval against the current message,
   with a hard cap. Add memory delete/edit to the Memory Center (read-only today) plus a
   per-user memory kill switch.
9. **Data rights** — export conversation (JSON/Markdown), delete account with full cascade.

### Exit criteria

- [ ] Messages are queryable in SQL; thread search returns hits.
- [ ] `EXPLAIN` shows index scans for thread list and message load.
- [ ] Opening a 500-message thread loads a window, not the whole history.
- [ ] Cold start performs no DDL.
- [ ] Memory injection is bounded and semantically ranked.

### Phase 3 status

> **`NOT DONE`** — Not started.

---

## Phase 4 — Chat experience completeness

**Goal:** remove every dead control and close the table-stakes gaps against a top-tier chat product.
**Risk:** medium. **Touches:** `components/chat/`, `store/chat-store.ts`, `app/api/chat/`.

### Work

1. **Stop / abort.** There is no stop button anywhere and no abort path — a runaway generation
   cannot be cancelled and keeps billing. Add stop to the composer, propagate the abort signal
   through the route into the graph, and persist the partial message.
2. **Resumable streams.** Refreshing mid-answer loses the response permanently. Persist stream
   state and reattach on reload.
3. **Per-thread chat instance.** `store/chat-store.ts` creates a **single module-level `Chat`
   instance** shared by every thread, with a module-level `fallbackThreadId` reused for the whole
   session, and `ChatShell` clobbers `messages` via `setMessages` on every navigation. Key the
   chat instance by thread id so switching threads mid-stream cannot cross-contaminate.
4. **Wire the dead controls** — the `+` attachment button in `components/chat/chat-composer.tsx`
   has an `aria-label` and no handler; the Retry action in
   `components/custom/message-renderer.tsx` is `onClick={() => {}}`. Either implement
   (attachments: image/PDF upload → vision models; retry: `regenerate()`) or remove. Shipping
   controls that do nothing is worse than not shipping them.
5. **LLM-generated thread titles.** `deriveThreadTitle` truncates the first message at 30 chars.
   Generate a real title from the first exchange with a cheap model, streamed in after the fact.
6. **Message-level features** — edit & resend, branch/fork a conversation, per-message model
   attribution, token cost display, regenerate with a different model.
7. **Streaming polish** — the artificial `▍` cursor appended to text in the renderer, typing
   indicator, and tool-call progress should come from real stream state; render reasoning parts
   (currently dropped by the converter).
8. **Empty/loading/error states** consistent across sidebar, memories, and profile.
   Note `app/(chat)/profile/page.tsx` divides by `creditedUnits` without a zero guard →
   `NaN%` on a fresh account.

### Exit criteria

- [ ] Stop cancels the stream, persists the partial answer, stops billing.
- [ ] Refresh mid-stream resumes the same answer.
- [ ] No control in the UI is a no-op.
- [ ] Rapidly switching threads mid-stream never mixes messages.

### Phase 4 status

> **`NOT DONE`** — Not started.

---

## Phase 5 — Observability and reliability

**Goal:** any failed request is explainable from a single request id, and cost is visible per user
and per model.
**Risk:** low-medium. **Touches:** `instrumentation.ts`, `server/lib/`, provider call sites.

### Work

1. **OpenTelemetry** via `instrumentation.ts` — spans for route → graph node → LLM call → tool
   call, carrying the existing `requestId` / `llmCallId` / `userId` / `modelId` as attributes.
   The logger already emits these fields; make them trace attributes too.
2. **Error tracking** (Sentry or equivalent) with source maps, `requestId` correlation, and
   `AppError.code` as the grouping key. Explicitly do not capture `AppError` 4xx as incidents.
3. **LangSmith tracing** for the agent graph — prompt/response/tool visibility during incidents.
4. **Resilience on provider calls** — timeouts, bounded retries with jittered backoff, and a
   circuit breaker per provider that degrades to a fallback model instead of failing the turn.
   `llmCall` currently logs and rethrows with no retry.
5. **Health & readiness** — `/api/health` (liveness) and a deeper readiness check covering DB and
   at least one provider, for the deployment platform's health probe.
6. **Cost dashboard** — the structured logs already carry input/output/total tokens per call;
   ship queries + a dashboard for spend per user, per model, per day, with an anomaly alert.
7. **SLOs and alerts** — chat p95 time-to-first-token, stream error rate, 5xx rate, and Polar
   ingest failure rate, each with a paging threshold.

### Exit criteria

- [ ] A user-reported request id resolves to a full trace: route span → graph → LLM → tool.
- [ ] A provider outage degrades to a fallback model instead of a 500.
- [ ] Daily spend per user is queryable and alerting on anomalies.

### Phase 5 status

> **`NOT DONE`** — Not started.

---

## Phase 6 — Test depth

**Goal:** the risky paths (auth, ownership, model access, quota, streaming) are covered by tests
that actually exercise them.
**Risk:** low. **Touches:** `tests/`, CI.

### Work

1. **Integration tests for route handlers** against an ephemeral Postgres (Testcontainers or a CI
   service container): anonymous → 401, foreign thread → 403, Pro model without a subscription →
   403, malformed body → 400 with issues, over quota → 429. These are the exact invariants the
   README claims and nothing currently verifies.
2. **Service-layer tests** with a real DB — `ensureThreadAccess`, `getThreadHistory`,
   `listMemories`, subscription checks against a mocked Polar.
3. **Contract tests** — every tool's Zod schema round-trips through the transport shape the
   renderer parses (locks the phase-1 contract).
4. **E2E with Playwright** — sign in, send a message, see it stream, see a tool card render,
   stop a stream, switch threads, hit the upgrade flow. Run against a seeded DB with recorded
   provider fixtures so it is deterministic and free.
5. **Coverage gates in CI** — thresholds on `server/` and `lib/` specifically, not a global
   average that dead UI code can dilute.
6. **Load test** — a k6/Artillery scenario for concurrent streams, asserting the phase-2 limits.

### Exit criteria

- [ ] Every `AppError` code has a test that produces it through a real route call.
- [ ] E2E suite green in CI on every PR.
- [ ] Coverage gate enforced for `server/` and `lib/`.

### Phase 6 status

> **`NOT DONE`** — Not started.

---

## Phase 7 — Bundle, performance, and dead code

**Goal:** ship less code, faster.
**Risk:** low (deletions are verifiable). **Touches:** `components/ai-elements/`, `package.json`, `next.config.ts`.

### Work

1. **Delete the unreachable half of the UI.** Reachability analysis from the four actually-imported
   roots (`prompt-input`, `message`, `model-selector`, `speech-input`) shows **44 of 48
   `components/ai-elements` files — 9,609 LOC — are unreachable**, including `voice-selector`,
   `test-results`, `stack-trace`, `schema-display`, `commit`, `file-tree`, `web-preview`,
   `sandbox`, `canvas`, `node`, `edge`. Delete them (git history keeps them recoverable).
2. **Drop the dependencies they alone pulled in** — `@xyflow/react`, `media-chrome`, `shiki`,
   `@rive-app/react-webgl2`, `react-jsx-parser`, `tokenlens`, `ansi-to-react`,
   `use-stick-to-bottom`, and the `@streamdown/*` add-ons if they stay unreferenced. Verified as
   having zero importers outside the dead set.
3. **Bundle analysis** in CI with a size budget that fails the build on regression.
4. **Images.** `@next/next/no-img-element` is disabled and remote thumbnails (SerpAPI, Yahoo)
   render as raw `<img>`. Move to `next/image` with `remotePatterns`, then re-enable the rule.
5. **Caching** — `unstable_cache`/`revalidateTag` for thread lists, memories, and subscription
   status; a static shell for the chat route.
6. **Streaming SSR / Suspense boundaries** so the sidebar and thread list do not block first paint.
7. **Time-to-first-token budget** — measure and optimize the pre-LLM work: today a turn does an
   ownership `SELECT`, a Polar API call, a memory read, _and_ a parallel `gpt-5-nano` extraction
   call before tokens flow.

### Exit criteria

- [ ] Codebase under ~13k LOC with identical functionality.
- [ ] Bundle budget enforced in CI; measured reduction recorded here.
- [ ] Lighthouse ≥ 95 performance / ≥ 95 a11y on the chat route.
- [ ] p95 time-to-first-token recorded before and after.

### Phase 7 status

> **`NOT DONE`** — Not started.

---

## Phase 8 — Product surface and polish

**Goal:** the thing a stranger lands on is as considered as the thing a user logs into.
**Risk:** low. **Touches:** new public routes, theming, a11y, docs.

### Work

1. **Public landing + pricing.** `/` currently sits inside `(chat)` behind an auth redirect —
   there is no marketing surface at all, and no way to see pricing before signing up. Add a
   public landing, a pricing page driven by `MODEL_REGISTRY` tiers, and move the app to `/app`.
2. **SEO** — `robots.ts`, `sitemap.ts`, per-route metadata, JSON-LD. (Metadata/OG are already
   solid in `app/layout.tsx`; the routes to index simply do not exist yet.)
3. **Resolve the theme contradiction.** `app/layout.tsx` hardcodes `className="dark"` on `<html>`
   while `ThemeProvider` is configured with `enableSystem`, so the system setting can never win.
   Either ship a real light theme (tokenized, both themes audited for contrast) or drop
   `enableSystem` and commit to dark. Decide, then make the code say so.
4. **Accessibility pass** — fix the two `jsx-a11y/role-has-required-aria-props` warnings, add
   `aria-live` announcements for streaming responses, full keyboard navigation, visible focus
   rings, and reduced-motion support across the glassmorphism animations.
5. **Onboarding** — first-run tour, model-picker explanation, memory explainer with a consent
   moment (the app stores durable personal facts and never asks).
6. **Command palette** (`cmdk` is already a dependency) — thread switching, model switching,
   new chat, search.
7. **Docs** — `ARCHITECTURE.md`, `CONTRIBUTING.md`, `docs/adr/` for the real decisions
   (LangGraph over raw AI SDK; Polar over Stripe; checkpoints vs. an owned message table),
   and `docs/runbook.md` for on-call.

### Exit criteria

- [ ] Public landing and pricing are indexable and pass Lighthouse SEO.
- [ ] Theme behavior matches its configuration.
- [ ] axe-core reports zero violations on every route.
- [ ] A new contributor can go from clone to running app using only the docs.

### Phase 8 status

> **`NOT DONE`** — Not started.

---

## Sequencing

```
Phase 0  Guardrails ────────────────┐  (blocks everything: no gate = no safe refactor)
Phase 1  Bulletproof types ─────────┤  (must precede 3/4: contracts change shapes)
Phase 2  Security & cost ───────────┤  (independent of 3+; ship early, it stops the bleeding)
Phase 3  Own the data ──────────────┤  (blocks 4: resumable streams need a message table)
Phase 4  Chat completeness ─────────┤
Phase 5  Observability ─────────────┤  (can run parallel with 4)
Phase 6  Test depth ────────────────┤  (grows through every phase; gate lands here)
Phase 7  Bundle & perf ─────────────┤  (safe any time after 0; cheapest big win)
Phase 8  Product surface ───────────┘
```

**Chosen order (owner decision, 2026-09-09): start with the API and DB layer.**

Phase 3 is promoted to the front as **Phase A**, carrying with it the parts of phases 0, 1, and 2
that the API/DB work cannot be done correctly without: schema validation at the new route
boundaries (phase 1), auth/ownership/rate-limit enforcement on those routes (phase 2), and CI to
gate them (phase 0). The rest of each phase follows in its original numbering.

```
Phase A  DB schema + API surface   ← executing now
Phase B  = Phase 0 remainder (CI, env, error pages)
Phase C  = Phase 1 remainder (tool contracts, converters, tsconfig/eslint tightening)
Phase D  = Phase 2 remainder (middleware, headers, quota, webhooks)
Phase E  = Phase 7 (delete the 9,609 unreachable LOC)
Phase F  = Phase 4 → 5 → 6 → 8
```

---

## Phase A — DB foundation and API surface (executing)

The API/DB slice, pulled forward. Scope is "the app owns its data and exposes it through one
consistent, typed HTTP surface." Everything here obeys C1 (bulletproof types) from day one — new
code does not get a grace period.

### A1 — Database driver

`db/index.ts` uses `@neondatabase/serverless`'s `neon()` HTTP driver, which cannot run
transactions or hold session state, while `PostgresSaver` and `PostgresStore` open separate `pg`
TCP connections to the same database. Thread creation and its first message therefore cannot
commit atomically.

Move to `drizzle-orm/neon-serverless` with a `Pool`: real transactions, still serverless-safe,
still Neon. One driver, one pool, transactions available.

### A2 — Schema

Regenerated from a clean baseline (C4 dev exemption).

- **`thread`** — add `(user_id, created_at desc)` index (the live DB has none, see snapshot);
  make `updated_at` non-null with a default and actually maintain it; add `last_message_at`,
  `archived_at`, `pinned_at`.
- **`message`** _(new)_ — `id`, `thread_id` (FK cascade), `role`, `parts` jsonb validated by a
  Zod schema on every write, `model_id`, `input_tokens`, `output_tokens`, `created_at`;
  index `(thread_id, created_at)`. Conversations become queryable, paginable, exportable, and
  deletable instead of living only inside checkpoint blobs.
- **`subscription`** _(new)_ — `user_id`, `polar_subscription_id`, `status`, `product_id`,
  `current_period_end`, `updated_at`. Landed now so phase D's webhook work is pure wiring, and so
  `hasActiveSubscription` can stop calling the Polar API on every message.

### A3 — Repository layer

`server/db/*-repository.ts` — the only modules that build queries. Services call repositories;
repositories return domain types parsed from the row shape. No `unknown` escapes a repository.

### A4 — Shared route plumbing

`server/lib/route-handler.ts` — one typed `createRouteHandler({ params, body, handler })` that
resolves the request id, parses params and body through Zod, requires a session, invokes the
handler with fully-typed arguments, and maps thrown `AppError`s to responses. Today
`app/api/chat/route.ts` does all of this inline; with nine routes that duplication becomes nine
chances to forget the auth check.

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

Every route: session required, ownership enforced server-side, Zod-parsed input, `AppError`
output, `x-request-id` echoed, one structured log line per outcome.

### A6 — Wire the client

`lib/threads.ts` (a `"use server"` action) is replaced by TanStack Query against `/api/threads`,
which is what makes the sidebar able to paginate, rename, and delete. The chat turn persists both
the user message and the assistant message through the repository.

### A7 — Migration reset

Drop `drizzle/0000_wise_prism.sql` and `drizzle/0001_powerful_falcon.sql`, regenerate a single
`0000_init`, drop and recreate the dev schema, re-run `PostgresSaver`/`PostgresStore` setup as a
migration step rather than at module import (`server/chat/agent.ts:24`).

**This drops all 39 threads, 401 checkpoints, and 7 dev users.** Authorized by the owner on
2026-09-09 for this development branch only.

### A8 — Tests

Repository tests against an ephemeral database, and one route-contract test per endpoint covering
401 / 403 / 400 / 200. This is where the integration-test story from phase 6 starts.

### Exit criteria

- [x] `pnpm migration:migrate` on an empty database produces the full schema, checkpoint and
      vector tables included, with no DDL at import time. _(Verified: dropped and rebuilt the dev
      branch three times; `0000_init` + `db:setup:langgraph` reproduce all 14 tables.)_
- [x] `EXPLAIN` shows an index scan for the thread-list and message-history queries.
      _(Verified on 20k rows — see the measurement below.)_
- [x] Routes return correct 401 / 400 / 200 against the running app. _(403/404 ownership paths are
      covered by service-layer logic but not yet by an authenticated integration test — that test
      needs the session fixture from phase 6. **Carried forward**, see below.)_
- [x] Sidebar lists, renames, and deletes threads through the HTTP API.
- [x] A chat turn writes both messages to the `message` table. _(The user turn is written before
      the model runs; the assistant turn is written from the graph node. They are **not yet in one
      transaction** — the assistant turn is produced inside a stream that outlives the request.
      **Carried forward** to phase 4 with resumable streams.)_
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

### Carried forward from Phase A

1. Authenticated route tests (403/404 ownership paths) — needs a Better Auth session fixture;
   folded into phase 6.
2. One-transaction turn persistence — needs the stream lifecycle work; folded into phase 4.
3. The `subscription` table ships as schema only. Its repository and the webhook that fills it
   are phase 2/D work; until then `hasActiveSubscription` still calls Polar per request.
4. The client still reads history from LangGraph checkpoints. The `message` table is written but
   not yet read — the deliberate dual-write step before the read switch in phase 4.

### Phase A status

> **`COMPLETED`** — A1–A8 landed and verified: Neon `Pool` driver with transactions, clean
> `0000_init` baseline (all 22 timestamps `timestamptz`), `message` + `subscription` tables,
> keyset-paginated repositories, a shared typed route handler, ten HTTP routes, a typed API
> client, sidebar rename/delete, memory delete with vector-ranked bounded prompt injection, and
> 41 passing tests. Four items carried forward, listed above.

---

## Phase A2 — Better Auth → Clerk

Not in the original plan; requested mid-flight on 2026-09-09 and executed against the
`clerk-setup`, `clerk-nextjs-patterns`, and `clerk-webhooks` skills.

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
signs up and immediately sends a message can beat the webhook and hit a foreign-key violation.
The Clerk webhook skill is explicit that webhooks must not be part of a synchronous flow.

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

### Carried forward

1. ~~Only social sign-in is enabled.~~ **Not a gap — a product decision** (owner, 2026-09-09):
   Google, GitHub, and LinkedIn are the entire sign-in surface, and no user ever types a password.
   The email/password styling written "just in case" has been deleted rather than carried as
   speculative code. See "Social-only authentication" below.
2. **`CLERK_WEBHOOK_SIGNING_SECRET` is unset**, so the webhook returns 503 and user rows come only
   from just-in-time provisioning. Polar customer creation currently rides on `user.created`, so it
   does not run until the webhook is configured.
3. **Dead env vars** remain in `.env` (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_*`,
   `GITHUB_CLIENT_*`). Left in place rather than deleted from a file holding real secrets.
4. **Clerk `appearance.elements` overrides had no effect** in `@clerk/ui` v1, so Clerk's card chrome
   and header are still its own. Resolved by removing the competing headline from the shell rather
   than fighting the CSS; revisit if tighter visual integration is wanted.

### Phase A2 status

> **`COMPLETED`** — Better Auth fully removed, Clerk in place with resource-level authorization,
> local user mirror with JIT provisioning plus webhook sync, and Polar checkout/portal re-homed to
> server routes. Four items carried forward, listed above.

---

## Phase A3 — Auth screen redesign

Follow-up to A2: the sign-in and sign-up screens read as off-centre and unfinished. Diagnosed in
the browser rather than by eye, which turned up two real bugs beyond the layout.

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
   `font-family: var(--font-sans)` on `<html>` and `--font-sans` maps to `--font-sora`, but the
   Next font variables were declared on `<body>`. At `<html>` level the variable was undefined, so
   the entire app fell back to `system-ui` while loading Sora over the network and never using it.
   Moving the variables to `<html>` does not work either: `next-themes` runs with
   `attribute="class"` and rewrites that className, stripping them. The fix is to keep the
   variables on `<body>` and give `<body>` the `font-sans` class, so `--font-sans` re-resolves in a
   scope where `--font-sora` exists. **This changes typography across the whole product.**
2. **Next.js dev kept serving a stale client bundle.** The server HTML was correct (verified with
   `curl`) while the browser rendered an empty headline. Verification moved to a production build
   on a separate port, which is also closer to what users get.

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

## Social-only authentication

**Decision (owner, 2026-09-09):** Google, GitHub, and LinkedIn are the only ways into the product.
No email, no password, no verification codes.

### What this buys

- **No credential surface.** The app never receives, transmits, or stores a password, and there is
  no password-reset flow to attack. Phase 2's auth-hardening work shrinks accordingly: password
  policy and reset-flow abuse simply do not apply.
- **Verified email for free.** Every identity arrives from a provider that has already verified the
  address, so `emailVerified` is meaningful without this app sending a single email.
- **No transactional email dependency.** No provider to configure, no deliverability to monitor.

### What it costs, and what to watch

- **Provider outage is total lockout.** With one method there is no fallback; with three there is,
  but only if a user has more than one. Clerk's account linking matches identities by verified
  email, so a user who signs in with Google today and GitHub tomorrow lands on the same account
  when the addresses match. Worth confirming that setting is on in the dashboard.
- **Anyone without one of the three is excluded.** Fine for a developer product where GitHub and
  Google are near-universal; it would not be for a general consumer audience.
- **The LinkedIn mark is the weakest signal** of the three in a developer context. If sign-in
  conversion is ever measured, that is the one to watch.

### Code implications, applied

- Deleted the `cl-dividerLine`, `cl-dividerText`, `cl-formFieldInput`, `cl-formFieldLabel`, and
  `cl-formButtonPrimary` rules from `app/globals.css`. Confirmed against the live DOM that Clerk
  renders none of those elements under a social-only configuration.
- `server/auth/user-service.ts` keeps its `@placeholder.invalid` email fallback. Under social-only
  every identity carries a verified address, so the fallback should never fire — it stays because
  the foreign key must hold even if a provider ever returns an unexpected payload.
- Clerk's own arrangement of the buttons is left alone: the last-used provider gets a labelled
  full-width button and the others sit beside it as marks. Forcing all three to labelled block
  buttons needs `layout.socialButtonsVariant`, which is **not on the `Appearance` type in
  `@clerk/ui` v1** and does not typecheck. Available on request via CSS generated content, but that
  hardcodes provider names in a stylesheet and was not worth the trade.

## Progress log

| Phase                 | Status     | Notes                                           |
| --------------------- | ---------- | ----------------------------------------------- |
| **A — DB + API**      | **`WIP`**  | A1 driver + A2 schema landed; A3–A8 outstanding |
| 0 — Guardrails        | `NOT DONE` | —                                               |
| 1 — Bulletproof types | `NOT DONE` | —                                               |
| 2 — Security & cost   | `NOT DONE` | —                                               |
| 3 — Own the data      | `NOT DONE` | superseded in part by Phase A                   |
| 4 — Chat completeness | `NOT DONE` | —                                               |
| 5 — Observability     | `NOT DONE` | —                                               |
| 6 — Test depth        | `NOT DONE` | —                                               |
| 7 — Bundle & perf     | `NOT DONE` | —                                               |
| 8 — Product surface   | `NOT DONE` | —                                               |

Update a phase's marker in **two places** whenever it changes: the `### Phase N status` block at
the end of that phase's section, and this table. They must never disagree.
