# Architecture

How AIChatWave is put together and why. This is the map: it names the pieces, the boundaries
between them, and the rules those boundaries enforce. It does not restate what the code says — each
module carries its own reasoning in a header comment, and where a decision was contested it has an
[ADR](docs/adr/).

For what is actually deployed and what is still open, see [`docs/pro_plan.md`](docs/pro_plan.md).
For how to run it, [`CONTRIBUTING.md`](CONTRIBUTING.md). For when it breaks,
[`docs/runbook.md`](docs/runbook.md).

---

## The shape of it

```
Browser
  │
  ├─ /              marketing        ── public, indexed, server-rendered per request
  ├─ /pricing       marketing        ── price read from Polar
  ├─ /sign-in|up    Clerk widgets    ── public, noindex
  └─ /app/*         the workspace    ── auth.protect(), noindex
        │
        │  fetch
        ▼
  /api/*   createRouteHandler ── request id · zod params/query/body · session
        │                        cross-origin check · typed error envelope · span
        ▼
  server/…  services ── plan · quota · rate limit · thread access · attachments
        │
        ├─ server/chat/agent.ts   LangGraph StateGraph
        │     ├─ callLlm       → OpenAI | Google | Anthropic  (circuit-broken, with fallback)
        │     ├─ tools         → products · weather · news
        │     └─ memoryRemember→ pgvector store
        │
        └─ db/  Drizzle ── Postgres (Neon in production, pgvector everywhere)
              thread · message · attachment · chat_stream · chat_stream_chunk
              user · account_deletion · subscription · usage_counter
              rate_limit_bucket · stream_lease
              checkpoints · checkpoint_blobs · checkpoint_writes   (LangGraph)
              store · store_vectors                                (LangGraph)
```

Four external systems: **Clerk** (identity), **Polar** (billing), three **model providers**, and
**SerpAPI** (product search, optional).

---

## Boundaries, and what each one guarantees

The value of this codebase is mostly in its boundaries. Each one is a place where an unknown becomes
a known, and the rule is always the same: **parse once, at the edge, into a named type.**

### `proxy.ts` — transport security only

Clerk's middleware, named `proxy.ts` because this is Next.js 16. It contains **no authorization**,
deliberately: Clerk deprecates `createRouteMatcher()` gating because Server Functions are invoked by
id rather than path, so a path matcher gives a false sense of security. See
[ADR-0001](docs/adr/0001-clerk-over-better-auth.md).

What it does own is the per-request **CSP nonce** and the security headers, which have to be set
before the response exists. `script-src` carries the nonce plus `'strict-dynamic'` and no
`'unsafe-inline'`. That has a consequence worth knowing before you add a page: **`'strict-dynamic'`
makes `'self'` inert, so a statically prerendered page ships script tags with no nonce and none of
its JavaScript runs.** Every page in this app is dynamic; the public ones say so with
`connection()`. See [ADR-0007](docs/adr/0007-workspace-under-app-prefix.md).

### `server/lib/route-handler.ts` — one wrapper per API route

Every route is built from `createRouteHandler` (session required) or `createPublicRouteHandler`
(explicitly not). Two functions rather than a flag, so "public" is a visible choice at the call site
and cannot be reached by forgetting an option.

It owns, once, what every route would otherwise repeat: request-id resolution, `params`/`query`/
`body` parsing through explicit Zod schemas, session lookup, the cross-origin check on mutating
methods, the typed error envelope, incident reporting, the API 5xx SLO counter, and the root span.

Route params, query and body each require a schema — pass `noParams` / `noQuery` / `noBody` when a
route has none. Being explicit is what lets the handler body receive fully-typed values with no
`unknown` in sight.

### `lib/api/contracts.ts` — the wire is a type

Both sides parse through the same Zod schemas: routes serialize domain records into DTOs
(`server/api/dto.ts`), and `lib/api/client.ts` parses responses back. `fetch` returns `any`; this is
where that stops. A server-side shape change surfaces as a caught error at the boundary rather than
as `undefined` three components deep.

### Authorization sits on resources

There is no single gate. Each resource enforces its own:

| Surface        | Enforced by                                          |
| -------------- | ---------------------------------------------------- |
| Pages, layouts | `auth.protect()` in `app/app/layout.tsx`             |
| API routes     | `requireSessionUserId()` inside `createRouteHandler` |
| Server actions | `getSessionUserId()` in `lib/polar.ts`               |
| Data access    | every repository query is scoped by `user_id`        |

The last row is the one that actually holds. The others are defence in depth.

---

## Where the rules live

A recurring pattern: one module owns a rule, and everything else reads it rather than restating it.
Restating is how a limit ends up enforced at 150 and advertised at 500.

| Rule                           | Owner                        | Read by                                                        |
| ------------------------------ | ---------------------------- | -------------------------------------------------------------- |
| Models, tiers, prices, names   | `lib/ai/model-registry.ts`   | picker, palette, `/pricing`, onboarding, agent, cost dashboard |
| Plan limits, usage periods     | `lib/billing/plan-policy.ts` | rate limiter, quota service, profile page, `/pricing`          |
| Every in-app URL               | `lib/routes.ts`              | components, `robots.ts`, `sitemap.ts`, redirects               |
| Error codes and their statuses | `server/lib/app-error.ts`    | every route, the client's error parser                         |
| SLOs and their runbook links   | `lib/observability/slo.ts`   | `/api/admin/slo`, the operations dashboard                     |
| The JSON boundary type         | `lib/json.ts`                | everything that crosses a serialization edge                   |

The registry is the clearest case. It carries the id tuple, provider, tier, modalities, list price
_and_ display name, checked against `Record<ModelId, ModelConfig>` with `satisfies` — so adding a
model is a compile error until every one of those is stated. The model picker used to hold its own
parallel array of names and `isProOnly` booleans; that is gone, because two catalogues is one
catalogue and one lie waiting to happen.

---

## The chat turn, end to end

The single most important path. `server/chat/chat-service.ts` orchestrates it.

1. **Gate.** Resolve the plan (local mirror, cold-read Polar at most once per user), rate limit per
   user and per IP, acquire a concurrent-stream lease, verify thread ownership (creating the thread
   on a first message), check model _availability_ — is this deployment configured for it, a 503 an
   operator owns — then model _access_ — does the plan include it, a 403 the user can fix. Reserve
   quota last, because it is the only one that has to be refunded on failure.
2. **Context.** Read memory consent; if granted, look up the relevant memories by vector similarity,
   bounded at `MEMORY_PROMPT_LIMIT`. Load attachment blocks in parallel. See
   [ADR-0008](docs/adr/0008-opt-in-long-term-memory.md).
3. **Register the turn.** Write the `chat_stream` row _before_ the graph runs. It is the durable
   record of the turn's input and the anchor a reload reconnects to.
4. **Stream.** `agent.streamEvents` under the turn's own `AbortController` — **not** the request's.
   Next aborts the request signal when the client disconnects, and a page refresh is a disconnect;
   using it here would tear the answer down at exactly the moment the buffer exists to preserve it.
   Stopping is explicit: `DELETE /api/chat/[threadId]/stream`.
5. **Record.** Every chunk goes to `server/chat/turn-recorder.ts`, which reassembles tool calls and
   accumulates text, and to `stream-buffer.ts`, which persists chunks so a reconnect can replay
   them.
6. **Commit.** On settle, `turn-commit.ts` writes the user and assistant `message` rows in one
   transaction, releases the lease, ingests usage into Polar, generates the thread title if it needs
   one, and closes the turn span.

Two things are deliberately outside the response: memory extraction and title generation, both in
`waitUntil`.

### Why both a checkpoint and a `message` table

They have different jobs. The LangGraph checkpoint is the agent's state and is what makes a turn
resumable mid-generation. The `message` table is the product's data: paginated, full-text searchable,
exportable, with model id and token counts per row. See
[ADR-0004](docs/adr/0004-owned-message-table.md), including the known way they disagree.

---

## Constraint C1 — `unknown` is an input, and nothing else

Enforced by a custom ESLint rule, `eslint-rules/unknown-parse-boundary.mjs`.

`unknown` is allowed in exactly three places: a parameter's type, a property of a parameter's inline
object type, and a `catch` binding. Those are the three places a value genuinely has no type yet.

Rejected everywhere else — a field of a named type, a class property, a return type, and any
`unknown` nested in a type argument such as `Promise<unknown>` or `Record<string, unknown>`. Each of
those pushes narrowing onto every consumer instead of parsing once at the edge.

Alongside it: no `any` in any form (including one leaked from a dependency's types, which the
`no-unsafe-*` family catches), no type assertions at all (`assertionStyle: "never"`), no non-null
assertions, and exhaustive switches over unions.

This is the single rule that most shapes what the code looks like. It is why every external payload
— HTTP body, tool result, provider error, LangGraph state — has a Zod schema next to it.

---

## Observability

Three ids tie a user report to a trace: the **request id** (echoed as `x-request-id`, quoted by the
user), the **turn id**, and the **trace id**.

Instrumentation is written against `@opentelemetry/api`, never against an SDK, so `withSpan` resolves
to a no-op tracer when nothing is registered. There is no feature flag to forget, and no cost when
tracing is off. `instrumentation.ts` starts the SDK only when there is somewhere to export to.

`instrumentation.ts` also logs every uncaught request error with Next's `digest`. Without that, the
code on the error page matches nothing in the logs and "quote this id" is decorative.

---

## What is deliberately absent

- **No Redis.** The rate limiter and stream leases are Postgres tables with composite primary keys.
  One region, one round trip on a connection the request already holds, one less thing to be down.
  `docs/pro_plan.md` Phase D has the multi-region note.
- **No light theme.** [ADR-0005](docs/adr/0005-dark-theme-only.md).
- **No password.** [ADR-0006](docs/adr/0006-social-only-authentication.md).
- **No client-side model or price choice.** The server mints checkout URLs and resolves models.
- **No E2E suite yet.** Phase I item 5, deferred: it needs a Clerk test instance and CI secrets that
  do not exist. Recorded as open rather than stubbed out.
