# AIChatWave — System Design

> Status: describes `main` as of 2026-09-12 (commit `20728b9`).
> Companion document: [`docs/pro_plan.md`](./pro_plan.md) — the hardening roadmap and the
> record of _why_ most of the decisions below were made. This document describes what
> the system **is**; that one describes how it got there and what is left.

---

## 1. What this system is

AIChatWave is a **single-tenant-per-user, multi-model AI chat product for developers**. A signed-in
user holds conversations with one of four LLMs, the assistant can call tools that render as rich
generative-UI cards, and the system maintains a vector-ranked long-term memory of the user across
all their conversations. Usage is metered and gated by a Free/Pro subscription.

It is a **single Next.js 16 application** — App Router, React 19, server components plus route
handlers — deployed as one unit on Vercel, backed by **one Postgres database** (Neon, with
pgvector). There is no separate API service, no queue, no Redis, and no background worker. That
is a deliberate constraint: everything that would normally justify a second piece of
infrastructure (rate-limit counters, concurrency leases, usage quota, the billing cache) is
implemented as an indexed single-statement Postgres operation on a connection the request already
holds.

### Design principles visible throughout the codebase

| Principle                                              | How it shows up                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Parse, don't validate**                              | Every external value — HTTP body, route params, query string, provider payload, `jsonb` column, LangGraph checkpoint, webhook body — is parsed through a Zod schema at its edge. `unknown` is lint-enforced (`eslint-rules/unknown-parse-boundary.mjs`) to appear only as a function input or a `catch` binding. |
| **Make illegal states unrepresentable**                | `ChatRuntimeContext` brands `UserId` / `ThreadId` / `RequestId`, so passing a thread id where a user id belongs is a compile error rather than a billing bug.                                                                                                                                                    |
| **One source of truth per fact**                       | Model ids, providers, tiers, and provider env-var names live only in `lib/ai/model-registry.ts`; plan limits live only in `lib/billing/plan-policy.ts` and are read by both the server enforcement and the UI.                                                                                                   |
| **Authorization at the resource, never in middleware** | `proxy.ts` contains zero authz. Pages use `auth.protect()`, API routes use `requireSessionUserId()` inside the handler factory, and every repository query carries `where user_id = ?`.                                                                                                                          |
| **Fail in the cheapest place**                         | The chat gate ladder (§5) rejects in ascending cost order, so a burst never reaches the thing it would have been expensive to reach.                                                                                                                                                                             |
| **Vendor calls are never on the hot path**             | Plan resolution reads a local mirror; Polar is the source of truth, reconciled by webhook and by a background TTL refresh.                                                                                                                                                                                       |

---

## 2. Context — the system and its neighbours

```mermaid
graph TB
    subgraph Client["Browser"]
        UI["Next.js App Router UI<br/>React 19 · Tailwind 4 · shadcn"]
    end

    subgraph App["AIChatWave — single Next.js 16 deployment (Vercel)"]
        MW["proxy.ts<br/>Clerk middleware + CSP nonce + security headers"]
        RSC["Server Components<br/>(chat), memories, profile"]
        API["Route handlers<br/>/api/*"]
        SVC["Service layer<br/>server/**"]
        GRAPH["LangGraph agent"]
    end

    subgraph Data["Neon Postgres + pgvector"]
        APPDB[("App tables<br/>user · thread · message<br/>subscription · usage_counter<br/>rate_limit_bucket · stream_lease")]
        LGDB[("LangGraph tables<br/>checkpoints · checkpoint_blobs<br/>checkpoint_writes · store · store_vectors")]
    end

    subgraph Vendors["External services"]
        CLERK["Clerk<br/>identity, sessions, OAuth"]
        POLAR["Polar<br/>checkout, portal, meters, webhooks"]
        OPENAI["OpenAI<br/>chat · memory extraction · embeddings"]
        GOOGLE["Google Gemini"]
        ANTHROPIC["Anthropic Claude"]
        SERP["SerpAPI<br/>google_shopping"]
        METEO["Open-Meteo<br/>geocoding + forecast"]
        YAHOO["Yahoo Finance<br/>news search"]
    end

    UI -->|"fetch / SSE"| MW --> API
    UI -->|"RSC payload"| RSC
    API --> SVC
    RSC --> SVC
    SVC --> GRAPH
    SVC --> APPDB
    GRAPH --> LGDB
    GRAPH --> OPENAI
    GRAPH --> GOOGLE
    GRAPH --> ANTHROPIC
    GRAPH --> SERP
    GRAPH --> METEO
    GRAPH --> YAHOO
    MW -.->|"session verify"| CLERK
    SVC -->|"checkout · portal · ingest"| POLAR
    CLERK -->|"user.created / updated / deleted"| API
    POLAR -->|"subscription.*"| API
```

**Trust boundaries.** Three, and each is handled explicitly:

1. **Browser → app.** Clerk session cookie + `authorizedParties` (`azp` claim) check + same-origin
   guard on every mutating request + nonce-based CSP.
2. **App → vendors.** Every response parsed before use; every vendor failure has a typed,
   non-fatal or operator-owned outcome.
3. **Tool output / stored memory → model.** Fenced as untrusted data (§9.3). This is the prompt
   injection boundary, and it is the one most systems forget.

---

## 3. Code topology

```
app/                      routes only — no business logic
  (chat)/                 authenticated shell: layout calls auth.protect()
    page.tsx              new conversation
    chat/[thread_id]/     existing conversation (server-loads history)
    memories/             Memory Center
    profile/              plan, usage meter, billing portal
  api/
    chat/                 POST — the streaming turn
    threads/              CRUD + keyset-paginated messages
    memories/             list + delete
    billing/              checkout, portal
    webhooks/{clerk,polar} signature-verified, session-free
    health/               liveness + optional deep readiness
  sign-in/, sign-up/      branded Clerk screens

server/                   the service layer — the only code that touches DB or graph
  lib/                    route-handler factory, AppError, logger, request-id
  auth/                   session resolution, just-in-time user provisioning
  chat/                   agent graph, chat service, tools, prompts, persistence, fencing
  memory/                 memory service + pgvector store
  billing/                plan resolution, quota, checkout
  security/               rate limit, origin guard, client IP
  db/                     repositories (thread, message, usage, rate-limit, subscription)
  api/                    domain record → DTO

lib/                      client-safe: pure schemas, types, policy, no env or server imports
  ai/                     model registry, message parts, tool contracts, memory config
  api/                    wire contracts + typed browser client
  billing/                plan limits and usage-period arithmetic
  security/               sliding-window math, CSP builder, authorized parties

db/schema/                Drizzle schema (auth, chat, billing, limits)
drizzle/                  generated SQL migrations
components/               UI — ai-elements (vendored primitives), chat/, gen-ui/, ui/
store/                    Zustand: the AI SDK Chat instance + selected model
tests/                    140 Node test-runner unit tests over the pure modules
```

The layering rule is enforced by convention and reviewed in `AGENTS.md`/`pro_plan.md`:
**`app/` → `server/` → `db/`**, never the reverse, and `lib/` is importable from both sides
because it holds nothing but pure data and functions.

---

## 4. Request plumbing — one factory for the whole API

`server/lib/route-handler.ts` is the single place where an HTTP request becomes typed values.
Every route is built from it, which is what makes "an auth check was forgotten" structurally
impossible rather than a review responsibility.

```mermaid
flowchart TD
    REQ["Request"] --> RID["resolveRequestId()<br/>honour well-formed x-request-id, else mint"]
    RID --> ORIGIN{"assertSameOrigin<br/>mutating method?"}
    ORIGIN -->|"foreign Origin"| E403["403 FORBIDDEN"]
    ORIGIN -->|"ok / absent"| PARSE["parse params · query · body<br/>explicit Zod schema each"]
    PARSE -->|"fail"| E400["400 INVALID_REQUEST<br/>+ issues[] naming the field"]
    PARSE --> AUTHQ{"createRouteHandler<br/>or createPublicRouteHandler?"}
    AUTHQ -->|"authenticated"| SESS["requireSessionUserId()"]
    SESS -->|"anonymous"| E401["401 UNAUTHORIZED"]
    SESS --> H["handler({ userId, params, query, body, log, requestId })"]
    AUTHQ -->|"public"| H
    H --> OK["Response + x-request-id"]
    H -->|"throws"| MAP["toAppError → structured log → appErrorResponse"]
    MAP --> ERR["status + { error: { code, message, requestId, issues?, retryAfterSeconds? } }<br/>+ retry-after header"]
```

Two details that matter more than they look:

- **`noParams` / `noQuery` / `noBody` are required, not defaulted.** Being explicit is what lets
  the handler receive fully typed values with nothing left to narrow.
- **`withRequestId` rebuilds the response only if the header is missing**, passing the body
  through untouched — so a streaming response stays streaming.

**Public by exception.** Only `/api/health` uses `createPublicRouteHandler`. The two webhook routes
deliberately bypass the factory entirely: they are verified by signature, have no session to
resolve, and are legitimately cross-origin, so the factory's same-origin guard would reject them.

### Error model

`server/lib/app-error.ts` maps a closed set of codes to statuses. `AppError.message` is always
safe to show a user; internals go in `cause` and reach only the log.

| Code                                                  | Status    | Meaning                                                     |
| ----------------------------------------------------- | --------- | ----------------------------------------------------------- |
| `INVALID_JSON` / `INVALID_REQUEST` / `INVALID_CURSOR` | 400       | Malformed input, with `issues[]`                            |
| `UNAUTHORIZED`                                        | 401       | No session                                                  |
| `FORBIDDEN`                                           | 403       | Someone else's thread; foreign origin                       |
| `MODEL_ACCESS_DENIED`                                 | 403       | Plan doesn't include the model — user can fix by upgrading  |
| `NOT_FOUND` / `CONFLICT`                              | 404 / 409 |                                                             |
| `RATE_LIMITED`                                        | 429       | Slow down — carries `retryAfterSeconds`                     |
| `QUOTA_EXCEEDED`                                      | 429       | Allowance spent — different remedy, so a different code     |
| `INTERNAL_ERROR` / `UPSTREAM_ERROR`                   | 500 / 502 |                                                             |
| `SERVICE_UNAVAILABLE`                                 | 503       | Operator-owned: provider key missing, Polar credential dead |

`retryAfterSeconds` is carried **on the error object**, so the limiter (the only thing that knows
the number) and the response builder (the only thing that knows the header) stay connected. It is
mirrored into the JSON body as well as the header, because the AI SDK transport throws away
response headers — see §10.

---

## 5. The chat turn — the centre of the system

This is the request that everything else exists to protect. `POST /api/chat` →
`server/chat/chat-service.ts::streamChat`.

### 5.1 The gate ladder

The ordering is the design. Each gate is cheaper than the next and rejects a class of request the
later ones would have paid to discover.

```mermaid
flowchart TD
    A["POST /api/chat<br/>{ threadId, messageContent, selectedModel }"] --> B["toChatRuntimeContext()<br/>brand + validate all ids once"]
    B --> C["resolvePlan(userId)<br/>local mirror read · 0 Polar calls when warm"]
    C -->|"stale → waitUntil(refresh)"| C
    C --> D{"1 · Rate limit<br/>per-user window, then per-IP window"}
    D -->|"reject"| R429A["429 RATE_LIMITED + Retry-After"]
    D --> E{"2 · Stream slot<br/>acquire lease, plan.concurrentStreams"}
    E -->|"none free"| R429B["429 RATE_LIMITED + Retry-After"]
    E --> F{"3 · Thread access<br/>own it, or create it (+ JIT user provision)"}
    F -->|"someone else's"| R403A["403 FORBIDDEN"]
    F --> G{"4a · Model available?<br/>is this deployment configured for it"}
    G -->|"no key"| R503["503 SERVICE_UNAVAILABLE"]
    G --> H{"4b · Model accessible?<br/>does the plan include it"}
    H -->|"free plan, pro model"| R403B["403 MODEL_ACCESS_DENIED"]
    H --> I{"5 · Quota<br/>atomic reserve against monthly allowance"}
    I -->|"spent"| R429C["429 QUOTA_EXCEEDED + Retry-After = reset"]
    I --> J["persistUserTurn()<br/>user message written BEFORE the model runs"]
    J --> K["agent.streamEvents(v2)"]
    K --> L["toUIMessageStream → createUIMessageStreamResponse<br/>headers: x-request-id, x-quota-remaining, x-quota-limit"]
    L --> M["onStreamSettled → release stream slot"]

    R403A -.->|"refund quota · release slot"| X["catch"]
    R403B -.-> X
    R503 -.-> X
    R429C -.-> X
```

Why this order, stated plainly:

1. **Rate limit** — two indexed upserts, no writes to domain tables. A burst is refused before it
   can create a thread or provision a user.
2. **Stream slot** — bounds how much _in-flight_ work one account can hold. Taken before the
   pre-LLM work (ownership read, memory read, extraction call) because that work is itself worth
   containing. A single streamed turn can cost more than a rejected burst of a hundred.
3. **Thread access** — ownership, plus just-in-time user provisioning so the `thread.user_id`
   foreign key always holds even when Clerk's `user.created` webhook has not landed yet.
4. **Availability before access** — a 503 an operator owns before a 403 the user can fix by
   upgrading, so an unconfigured provider never reads as a billing problem.
5. **Quota** — last, and the only gate that _reserves_ something, so nothing is spent on a turn a
   cheaper gate would have refused.

Everything after the slot is acquired runs inside a `try` that **refunds the reservation and
releases the slot**, so a failure never leaks either.

### 5.2 End-to-end sequence

```mermaid
sequenceDiagram
    autonumber
    participant U as Browser (useChat)
    participant R as POST /api/chat
    participant S as chat-service
    participant DB as Postgres
    participant G as LangGraph agent
    participant M as Model provider
    participant T as Tool APIs

    U->>R: { threadId, messageContent, selectedModel }
    R->>R: origin guard · Zod parse · Clerk session
    R->>S: streamChat(+ clientIp from proxy headers)
    S->>DB: read billing_synced_at + active subscription
    S->>DB: consumeWindow(user), then consumeWindow(ip)
    S->>DB: acquireStreamLease(ownerKey, slots)
    S->>DB: thread ownership / create
    S->>DB: reserveMessage(user, period, limit)  [atomic]
    S->>DB: insert user message + touch thread
    S->>G: streamEvents({messages:[Human]}, {thread_id, context})

    par memory write (fire-and-forget branch)
        G->>M: gpt-5-nano structured extraction
        G->>DB: put new memories (+ embeddings)
    and answer
        G->>DB: vector search top-32 memories
        G->>M: system prompt (+fenced memories) + fenced history
        M-->>G: AIMessageChunk (streamed)
    end

    opt tool call requested
        G->>T: SerpAPI / Open-Meteo / Yahoo Finance
        T-->>G: JSON → parsed through tool contract
        G->>M: tool result appended, re-invoke
    end

    G-->>S: event stream
    S-->>U: SSE UI message stream (+ quota headers)
    Note over G,DB: waitUntil: persist assistant turn ·<br/>Polar events.ingest · recordQuotaTokens
    U->>U: stream settles → lease released
```

### 5.3 The agent graph

`server/chat/agent.ts` — a `StateGraph` over `MessagesState`, compiled with a **Postgres
checkpointer** and a **pgvector store**.

```mermaid
stateDiagram-v2
    [*] --> fanout
    state fanout <<fork>>
    fanout --> callLlm
    fanout --> memoryRememberNode

    memoryRememberNode --> [*] : extract + store memories

    callLlm --> decide
    state decide <<choice>>
    decide --> tools : last AIMessage has tool_calls
    decide --> [*] : otherwise
    tools --> callLlm
```

- **`START` fans out to two nodes in parallel.** Memory extraction (an extra `gpt-5-nano` call)
  runs _alongside_ the answer rather than in front of it, so it does not sit in the
  time-to-first-token path.
- **`callLlm`** resolves the model from the registry, binds the three tools, retrieves the
  user's top-32 relevant memories by vector search, formats the system prompt, and invokes the
  provider. On completion it fires three `waitUntil` side effects: persist the assistant turn,
  ingest tokens to Polar, and record tokens locally.
- **`tools` → `callLlm`** is the standard ReAct loop; the conditional edge ends the turn when the
  last message carries no tool calls.
- **Checkpointing** is per `thread_id`, so the graph's own working state survives across requests
  and the conversation continues without the client resending history.

### 5.4 Tools and generative UI

| Tool               | Upstream                                         | Renders as                               |
| ------------------ | ------------------------------------------------ | ---------------------------------------- |
| `display_products` | SerpAPI `google_shopping` (needs `SERP_API_KEY`) | `components/gen-ui/product-carousel.tsx` |
| `display_weather`  | Open-Meteo geocoding + forecast (keyless)        | `components/gen-ui/weather-card.tsx`     |
| `display_news`     | Yahoo Finance search, locally scored + deduped   | `components/gen-ui/news-card.tsx`        |

The contract in `lib/ai/tool-contracts.ts` is what makes this safe: the tool returns a
schema-parsed value and the card takes **the same inferred type as its props**, spread directly.
Adding a tool without a card — or renaming a field — is a compile error on both sides in the same
run, rather than a card silently rendering `0`.

---

## 6. Data model

Two schemas share one database: the **application tables** (Drizzle-managed, migrated with
drizzle-kit) and the **LangGraph tables** (created by `scripts/db-setup-langgraph.ts`, which runs
as part of `pnpm migration:migrate` so no DDL ever happens on the request path).

```mermaid
erDiagram
    USER ||--o{ THREAD : owns
    USER ||--o{ SUBSCRIPTION : has
    USER ||--o{ USAGE_COUNTER : meters
    THREAD ||--o{ MESSAGE : contains

    USER {
        text id PK "Clerk user id, verbatim"
        text name
        text email "indexed, not unique — Clerk is the authority"
        bool email_verified
        text image
        timestamptz billing_synced_at "null = cold cache"
        timestamptz created_at
        timestamptz updated_at
    }
    THREAD {
        text id PK
        text title
        text user_id FK "cascade"
        timestamptz updated_at "keyset sort key"
        timestamptz last_message_at
        timestamptz archived_at "partial index predicate"
        timestamptz pinned_at
    }
    MESSAGE {
        text id PK
        text thread_id FK "cascade"
        enum role "user | assistant | system"
        jsonb parts "MessageParts — parsed on every read AND write"
        text model_id "null for user turns"
        int input_tokens
        int output_tokens
        timestamptz created_at "keyset sort key"
    }
    SUBSCRIPTION {
        text id PK
        text user_id FK "cascade"
        text polar_subscription_id UK
        text polar_product_id
        enum status "7 Polar statuses"
        timestamptz current_period_end
        timestamptz cancel_at_period_end
    }
    USAGE_COUNTER {
        text user_id PK "composite"
        timestamptz period_start PK "midnight UTC, 1st of month"
        int messages "reserved pre-flight; what the quota gate reads"
        bigint input_tokens "recorded, never enforced"
        bigint output_tokens
    }
    RATE_LIMIT_BUCKET {
        text bucket_key PK "chat:user:… | chat:ip:…"
        timestamptz window_start PK "epoch-aligned"
        int hits
    }
    STREAM_LEASE {
        text owner_key PK "chat:user:…"
        int slot PK "0..concurrentStreams-1"
        text lease_id "holder identity"
        timestamptz expires_at "backstop, not the mechanism"
    }
```

`rate_limit_bucket` and `stream_lease` deliberately carry **no foreign key to `user`**: they are
keyed by whatever is being counted (a user id, but also an IP that belongs to nobody), and a
cascade from `user` would delete an abuser's counter at exactly the moment it is still wanted.

### Index design

Two indexes on `thread` rather than one, and the first is **partial**:

```sql
create index thread_active_user_updated_idx
  on thread (user_id, updated_at desc, id desc)
  where archived_at is null;          -- the sidebar's default query

create index thread_user_id_updated_at_id_idx
  on thread (user_id, updated_at desc, id desc);   -- the archived listing
```

The index tuple matches the keyset `ORDER BY` exactly, so Postgres walks the index and stops at
`LIMIT` instead of reading every one of a user's threads and sorting. Measured on 20k rows:
**0.099 ms / 30 rows read** with the partial predicate, against **0.263 ms / 171 rows** without.
`message_thread_id_created_at_id_idx` serves the same purpose for `(created_at asc, id asc)`.

### Pagination

Every list endpoint uses **keyset (cursor) pagination**, never offset: offset drifts when rows are
inserted mid-scroll and degrades on deep pages. Cursors are opaque to the client and validated on
the way back in, so a tampered cursor is a 400 rather than a query error.

### The `jsonb` boundary

`message.parts` is the one place data re-enters the app in a shape TypeScript cannot vouch for.
`server/db/message-repository.ts` parses through `messagePartsSchema` on **every read and every
write** — a row whose parts fail validation is skipped and logged, never surfaced half-typed.
That is what makes the `$type<MessageParts>()` annotation honest rather than aspirational.

### Dual write, single read — a known transitional state

A turn is written to **both** the LangGraph checkpoint and the `message` table.
`getThreadHistory` still reads from `agent.getState`, not from `message`. The table, its indexes,
its repository, and its HTTP route all exist and are exercised; the read switch is Phase F work.
Until it lands, `message` is a durable record that the product does not yet read back.

---

## 7. Identity and access

Clerk owns authentication entirely — sessions, OAuth providers, email/password, bot protection.
This app holds no provider client secrets.

```mermaid
flowchart LR
    subgraph Enforcement["Authorization, enforced per resource"]
        P["Pages / layouts<br/>auth.protect() in app/(chat)/layout.tsx"]
        A["API routes<br/>requireSessionUserId() in the handler factory"]
        SA["Server actions<br/>getSessionUserId() in lib/polar.ts"]
        D["Data access<br/>every repository query scoped by user_id"]
    end
    MW["proxy.ts<br/>NO authz — transport security only"] -.-> Enforcement
```

**Why `proxy.ts` has no authorization in it.** Clerk itself deprecates `createRouteMatcher()`
gating in middleware: Server Functions are invoked by id rather than by path, and path
normalization between the matcher and the router can diverge, so a matcher gives a false sense of
security. The middleware's actual job here is the CSP nonce and the security headers, which have
to be set before the response exists and therefore have nowhere else to live.

(The file is named `proxy.ts`, not `middleware.ts`, because this is Next.js 16.)

### The webhook race, and why provisioning is just-in-time

`thread.user_id` references `user.id`, and Clerk delivers `user.created` asynchronously. A user who
signs up and immediately sends a message can beat the webhook to the database and hit a foreign-key
violation. So `ensureUserProvisioned()` runs on the write paths that need the row, reading Clerk
directly and writing a placeholder if even that fails; the webhook then keeps the row current.
Both paths are idempotent upserts.

```mermaid
sequenceDiagram
    participant U as New user
    participant App as App
    participant Clerk as Clerk
    participant DB as Postgres
    participant Polar as Polar

    U->>Clerk: sign up
    Clerk-->>U: session
    par racing
        Clerk->>App: POST /api/webhooks/clerk (user.created)
        App->>DB: upsertUser
        App->>Polar: ensurePolarCustomer(externalId = clerk user id)
    and
        U->>App: first message
        App->>DB: localUserExists? no
        App->>Clerk: currentUser()
        App->>DB: upsertUser (JIT)
    end
    Note over DB: both paths are the same idempotent upsert —<br/>whichever wins, the FK holds
```

---

## 8. Billing, plans, and quota

Polar is the **source of truth**; the `subscription` table is a **local mirror**; the webhook is
the **invalidation channel**; `resolvePlan` is the **read path**.

This used to be the other way round — `assertModelAccess` called `polarClient.subscriptions.list`
on _every single message_, which put vendor latency and a vendor rate limit in front of the model
and failed **closed**, denying a paying user their own plan whenever Polar was slow.

```mermaid
flowchart TD
    START["resolvePlan(userId)"] --> SYNC{"user.billing_synced_at"}
    SYNC -->|"null — cold"| COLD["Call Polar once<br/>upsert subscriptions · mark synced"]
    COLD --> RET1["source = polar"]
    SYNC -->|"set"| LOCAL["Read active subscription locally"]
    LOCAL --> AGE{"older than 24h?"}
    AGE -->|"no — warm"| RET2["source = local · 0 Polar calls"]
    AGE -->|"yes — stale"| RET3["serve local answer NOW<br/>+ waitUntil(reconcileFromPolar)"]

    WH["POST /api/webhooks/polar<br/>subscription.created/updated/active/<br/>canceled/uncanceled/past_due/revoked"] -->|"signature-verified upsert<br/>+ markBillingSynced"| LOCAL
```

- **Warm** → one indexed local read.
- **Stale** → the local answer is served immediately and Polar is reconciled behind the response,
  so a missed webhook self-heals without costing a user latency. TTL is 24 h: short enough that a
  missed event is not a month-long free ride, long enough to be one call per user per day.
- **Cold** → the only request that pays for a Polar call. The sync stamp is written **only on
  success**, so a failed cold read stays cold and is retried rather than being cached as "free".
- A Polar status the SDK has never heard of is skipped and logged, never coerced to `active`.

### Plan limits — declared once, enforced and displayed from the same numbers

`lib/billing/plan-policy.ts` is client-safe on purpose: the composer can render "412 of 500 used"
from the numbers the server enforces, instead of a UI copy that drifts.

|                                 | Free                       | Pro                                   |
| ------------------------------- | -------------------------- | ------------------------------------- |
| Messages / calendar month (UTC) | 150                        | 5,000                                 |
| Requests / minute (per user)    | 10                         | 60                                    |
| Concurrent streams              | 1                          | 3                                     |
| Models                          | `gpt-5-mini`, `gpt-5-nano` | + `gemini-3.1-pro`, `claude-sonnet-4` |

Plus a shared **per-IP ceiling of 90 req/min**, loose enough for a carrier NAT or a shared office
to pass — it bounds a script, it does not police a household.

### Quota: reserve, don't count

```sql
insert into usage_counter (user_id, period_start, messages)
values ($1, $2, 1)
on conflict (user_id, period_start) do update
  set messages = usage_counter.messages + 1, updated_at = now()
  where usage_counter.messages < $3    -- the limit, as a predicate
returning messages
```

The limit is a predicate on the `do update`, so the row either moves or it does not, and
"did I get a slot?" is answered by whether a row came back. A read-then-write check is the classic
way an allowance is overrun — two requests both read 149 of 150 and both proceed. Reserving
_before_ the model runs also avoids leaving the last turn free (and, under concurrency, as many
free turns as there are in-flight requests). If the turn fails before any provider call, the
reservation is refunded, floored at zero so a period rollover cannot hand out free allowance.

Tokens are ingested to Polar (`events.ingest`, event `llm_tokens`) **and** recorded locally in the
same counter row. Polar stays the billing record; the local column is what enforcement reads, so
enforcement no longer depends on a vendor round trip. Ingest failures are logged, never fatal.

---

## 9. Abuse control, cost containment, and security

### 9.1 Three limits, cheapest-rejecting first

```mermaid
flowchart LR
    subgraph L1["1 · Per-user sliding window"]
        direction TB
        A1["10/min free · 60/min pro"]
        A2["matches how the product is priced"]
    end
    subgraph L2["2 · Per-IP sliding window"]
        direction TB
        B1["90/min, all plans"]
        B2["catches many throwaway accounts<br/>from one machine"]
    end
    subgraph L3["3 · Concurrent stream lease"]
        direction TB
        C1["1 free · 3 pro"]
        C2["the only limit that bounds COST<br/>rather than request count"]
    end
    L1 --> L2 --> L3
```

**Sliding window, not fixed.** `lib/security/sliding-window.ts` implements the standard two-bucket
approximation: current window count plus the un-decayed share of the previous one. Two integers per
key instead of a row per request, and none of the boundary burst a fixed window has — at the
instant a fixed window resets, a client can send 2× the limit, which is exactly the moment an
abusive client is watching for. Windows are **epoch-aligned**, so every replica agrees on where a
window starts without coordinating.

`Retry-After` is **computed, not guessed** — a client that honours it and is still rejected learns
to ignore it. And the counter is incremented **only for allowed requests** (a data-modifying CTE
guarded by the decision), so a rejected caller does not dig its own hole deeper, which is what
makes that number honest.

**Known and accepted:** both CTEs see the same snapshot, so N requests arriving in the same instant
can each see room and overshoot by up to N-1. The stream lease caps N per user at
`concurrentStreams`, so the overshoot is bounded by a small constant rather than by how fast an
attacker can send. Exact atomicity would need a lock per key, which costs more than the overshoot
is worth.

**Stream leases** claim the lowest free slot in a single `insert … select from generate_series …
where not exists … on conflict … where expires_at <= now()`, so the free-slot search and the claim
are the same statement. Release is matched on `lease_id` as well as slot, so a lease that already
expired and was taken over is not released out from under its new holder.

**Release on every exit a stream has.** `server/chat/stream-lifecycle.ts` wraps the response body so
the lease is freed when the stream ends, errors, **or is cancelled because the user navigated away
mid-answer** — the common case in a chat UI, and the one a `try/finally` around the handler never
sees, because the handler returned long before.

Counters are swept probabilistically (2% of requests, off the response path, one indexed range
delete), so there is no cron and no lock to own.

### 9.2 Transport security

`lib/security/security-headers.ts` builds the headers as pure data — pure and parameterised rather
than reading `lib/env.ts`, because pulling env validation into the edge runtime would make a
missing, unrelated key take down every request.

- **CSP with a per-request nonce and `'strict-dynamic'`, and no `'unsafe-inline'` on `script-src`.**
  An injected `<script>` does not execute even if an XSS hole exists. The nonce is set on the
  _request_ headers too, because that is how Next discovers it and stamps it on every script tag.
- **`style-src` keeps `'unsafe-inline'`, deliberately, and carries no nonce.** Shiki emits an inline
  `style` attribute per highlighted span, Clerk injects unnonced `<style>` elements, and React's
  `style` prop does the same — there is no nonce to give any of them. A nonce and `'unsafe-inline'`
  cancel each other out in the same directive, so adding one would silently disable the keyword it
  depends on.
- HSTS (2 years, `includeSubDomains`, `preload`) **only over TLS** — sending it in local dev would
  pin `localhost` to HTTPS in the developer's browser for two years.
- `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` + Clerk,
  COOP/CORP `same-origin`, and a `Permissions-Policy` that denies every powerful feature except
  `microphone=(self)` (the composer's speech input) and `fullscreen=(self)`.
- `CSP_REPORT_ONLY=true` flips to report-only for a staged rollout.
- **`authorizedParties`** — Clerk checks a token's `azp` claim against this list, which stops a
  token minted for another site being replayed here. A _partial_ list is worse than none: empty
  means no restriction, non-empty means reject anything unnamed, and on Vercel the custom domain
  is in `VERCEL_PROJECT_PRODUCTION_URL` while `VERCEL_URL` is the per-deployment host nobody
  visits. `resolveAuthorizedParties` collects all four candidates.
- **Same-origin guard** on every mutating API request. Absence of `Origin` is allowed — a
  non-browser client sends none and carries no ambient cookies — mirroring how Next guards Server
  Actions. It compares **hosts, not full origins**, because a proxied `Host` and the browser's
  `https` view differ often enough to cause false rejections on correctly configured deployments.
- **Client IP** prefers the platform-set `x-vercel-forwarded-for`, then only the **first** entry of
  `x-forwarded-for` (the hop the edge recorded), never the last. A spoofed value cannot raise a
  limit; at worst it moves the caller to a different bucket — which is why per-IP limiting
  supplements, and never substitutes for, per-user limiting.

### 9.3 Prompt-injection containment

Tool results are attacker-influenced text: a SerpAPI product title and a Yahoo headline are
authored by whoever owns the indexed page. Stored memories are derived from user messages and are
untrusted for the same reason.

```mermaid
flowchart LR
    T["Tool output<br/>(SerpAPI · Yahoo · Open-Meteo)"] --> F["fenceUntrustedMessages()"]
    M["Retrieved memories"] --> F2["fenceUserMemories()"]
    F --> P["&lt;untrusted-tool-output&gt; … &lt;/untrusted-tool-output&gt;"]
    F2 --> P2["&lt;untrusted-user-memory&gt; … &lt;/untrusted-user-memory&gt;"]
    P --> LLM["Model's view of the conversation"]
    P2 --> LLM
    SYS["System prompt: delimited content is DATA,<br/>never instruction, however phrased"] --> LLM
    T -.->|"UNCHANGED"| ST["Graph state / checkpoint / message.parts<br/>→ exact JSON the gen-UI cards parse"]
```

Three parts, and the third is the one usually forgotten:

1. Delimit untrusted spans explicitly.
2. Tell the model, in the system prompt, that delimited content is data and never instruction.
3. **Make the content unable to close the delimiter itself** — forged delimiters are caught
   regardless of case or padding, and control characters used to hide text from a human reviewer
   are stripped. A fence a payload can escape is decoration.

Fencing runs **only on the copy handed to the model**. Graph state keeps the exact tool JSON, so
the typed tool contracts still parse and the cards still render.

The memory-extraction prompt carries the same boundary: a message asking to store a directive is
a _fact about the message_, not a command.

### 9.4 Supply chain and secrets

- CI pins every third-party action to a **commit SHA**, not a tag (a tag is a movable pointer the
  action's owner can repoint at code that reads this repo's secrets).
- `pnpm audit --audit-level high --prod` **blocks**; accepted advisories are named by GHSA id in
  `package.json` with the reasoning recorded in `pro_plan.md`. A full non-blocking audit runs
  alongside for triage.
- **gitleaks** secret scan over the **full history** — a secret committed and later deleted is
  still in the repository.
- Dependabot configured; `.env.example` is in the repo and `.env` is not.

---

## 10. Frontend architecture

```mermaid
flowchart TD
    RSC["app/(chat)/chat/[thread_id]/page.tsx<br/>server component — loads history"]
    RSC -->|"StoredMessage[]"| CI["ChatInterfaceNew (client)"]
    CI --> SH["ChatShell"]
    SH -->|"convertLangChainToUI()"| MSG["ChatMessageList → MessageRenderer"]
    SH --> COMP["ChatComposer"]
    SH -->|"useChat({ chat: chatInstance })"| STORE["Zustand chat-store<br/>Chat + DefaultChatTransport"]
    STORE -->|"prepareSendMessagesRequest"| API["POST /api/chat"]
    COMP -->|"body: { threadId, selectedModel }"| STORE
    MSG -->|"part.type === 'dynamic-tool'"| CARDS["ProductCarousel · WeatherCard · NewsCard"]

    SIDEBAR["ThreadsLists"] -->|"TanStack Query"| TAPI["/api/threads (typed client)"]
    PROFILE["profile page"] -->|"server actions"| POLARSVC["lib/polar.ts → billing service"]
```

- **Rendering split.** Chat history, memories, and the layout shell are server components; the
  live conversation, composer, sidebar list, and profile are client components.
- **State.** Three separate concerns, deliberately not merged: Zustand holds the AI SDK `Chat`
  instance and the selected model; TanStack Query owns server state (threads, memories,
  subscription); component state owns the composer draft.
- **Typed API client.** `lib/api/client.ts` parses every response through `lib/api/contracts.ts`,
  so a server-side shape change surfaces as a caught error at the boundary instead of `undefined`
  three components deep.
- **The transport gap, and how it is closed.** `DefaultChatTransport` does not model HTTP failures:
  on a non-2xx it throws `new Error(await response.text())`, so the status, the headers, and
  `Retry-After` are gone by the time `useChat` surfaces the error. What survives is the body, as a
  string. That is exactly why the server mirrors `retryAfterSeconds` into the JSON envelope —
  `lib/api/chat-error.ts` parses it back out and collapses the server's codes into four _actions_
  (`rate-limited`, `quota-exceeded`, `model-access-denied`, `unauthorized`, `unavailable`,
  `unknown`) so the UI grows a branch per remedy, not per code.
- **Quota headers.** The streaming response carries `x-quota-remaining` and `x-quota-limit`, so the
  composer can show remaining messages without a second request.
- **Theme and brand.** Dark-first glass aesthetic; `next-themes` wrapper, Clerk's `shadcn` theme
  with brand variables, Sora + Geist Mono wired at `<body>` (they cannot live on `<html>` because
  `next-themes` rewrites that className).

---

## 11. Observability

Everything is correlated by **`requestId`**, which is honoured from an inbound `x-request-id` when
well-formed and minted otherwise, echoed on every response (including error bodies), and attached
to every log line through a child logger.

```mermaid
flowchart LR
    REQ["request"] --> RID["requestId"]
    RID --> L1["route log<br/>{ requestId, route, userId }"]
    RID --> L2["chat log<br/>+ threadId, modelId, planId"]
    RID --> L3["graph node log<br/>+ llmCallId, node"]
    L3 --> L4["llm.call_completed<br/>latencyMs · input/output/total tokens · toolCalls"]
    UNC["uncaught server error"] --> INSTR["instrumentation.ts onRequestError<br/>logs Next's digest + requestId + route"]
    INSTR --> PAGE["app/error.tsx shows the digest to the user"]
```

- **Structured logging only.** `server/lib/logger.ts` is the single sanctioned `console` boundary;
  every line is one JSON object with a merged context bag. Child loggers accumulate context
  (`requestId` → `+userId` → `+threadId, modelId` → `+llmCallId, node`).
- **Digest correlation.** Next hashes an uncaught server error into a `digest` and hands only that
  to `app/error.tsx`. Without logging it in `instrumentation.ts`, the code a user reads off the
  error page matches nothing in the logs and "quote this id" is decorative.
- **Health.** `GET /api/health` is liveness plus a DB readiness probe (503 when the DB is down, so
  a platform probe can pull the instance out of rotation). `?deep=1` additionally probes Polar —
  opt-in, because a revoked or wrong-environment Polar token is otherwise invisible until a
  customer fails to check out, but probing it on every liveness check would burn Polar rate limit.
- **Named log events** make failures greppable: `chat.stream_started`, `chat.stream_settled`,
  `llm.call_failed`, `ratelimit.user_rejected`, `quota.exceeded`, `billing.checkout_failed`
  (with `upstreamStatus`, `upstreamCode`, and which Polar environment the process is talking to),
  `memory.extract_failed`, `webhook.polar_subscription_synced`.
- **Not yet:** OpenTelemetry spans, error tracking with source maps, LangSmith tracing, provider
  retry/circuit-breaking, and a cost dashboard. All Phase H.

---

## 12. Configuration, build, and delivery

### Environment contract

`lib/env.ts` validates the whole process environment as an import side effect and **throws on
boot** if it is wrong — with each issue's message, not just the key name.

- **Required:** `DATABASE_URL`, Clerk publishable + secret keys, `OPENAI_API_KEY` (memory
  extraction and embeddings call it regardless of which chat model is selected), `POLAR_ACCESS_TOKEN`,
  `POLAR_PRODUCT_ID`.
- **Derived, not restated:** whichever provider `DEFAULT_MODEL_ID` uses must be configured. The
  check walks the registry, so moving the default to another provider moves the boot requirement
  with it — a hand-written check is precisely what would have been forgotten.
- **Optional → graceful degradation:** `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY` (their models return
  a typed 503 instead of the app refusing to start), `SERP_API_KEY`, the two webhook secrets
  (their routes return 503 until configured).
- **`POLAR_SERVER` is required in production and defaults only in development.** Sandbox and
  production are entirely separate Polar systems; leaving it unset used to silently mean "sandbox",
  so production credentials went to the sandbox API and every checkout failed with an opaque 502.
  The guard is exempt during `next build` (`lib/env-policy.ts`) because the build talks to nothing
  — enforcing a runtime-only setting at build time turns a config value into a deploy blocker
  without preventing anything reaching users.

### CI (`.github/workflows/ci.yml`)

Ordered cheapest-first so an obvious failure reports in seconds, with `if: !cancelled()` on every
step so one push surfaces every problem rather than one per re-run:

**format:check → lint (`--max-warnings=0`) → typecheck → test (140) → build → audit (blocking, prod, high+) → audit (advisory) → gitleaks**

CI deliberately does **not** set `POLAR_SERVER`, so the build-time exemption above is a _tested_
property: regressing the guard back to build time fails CI immediately.

### Migrations

`pnpm migration:generate` → drizzle-kit SQL in `drizzle/`; `pnpm migration:migrate` applies them
**and then** runs `db:setup:langgraph` to create the checkpoint and pgvector store tables. No DDL
ever runs on a request.

### TypeScript posture

Strict, plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and friends; no type
assertions; `unknown` restricted by a custom ESLint rule; type-aware linting enabled. This is why
so much of the code spreads conditionally (`...(x === undefined ? {} : { x })`) — under
`exactOptionalPropertyTypes`, "absent" and "present and undefined" are different types.

---

## 13. Failure modes and what happens

| Failure                                         | Behaviour                                                     | Rationale                                                     |
| ----------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| Provider API key missing for the selected model | 503 `SERVICE_UNAVAILABLE`, named provider in `cause`          | Operator problem, not a billing one                           |
| Provider call fails mid-turn                    | Logged with latency, rethrown; quota refunded, slot released  | No retry/fallback yet — Phase H item 4                        |
| Polar down, warm cache                          | No effect — plan served locally                               | The point of the mirror                                       |
| Polar down, cold cache                          | Treated as "no subscription", sync stamp **not** written      | Conservative; retried next request rather than cached as free |
| Polar webhook missed                            | Self-heals within 24 h via the stale-refresh path             | TTL is the backstop for the webhook                           |
| Clerk `user.created` late                       | JIT provisioning writes the row first                         | FK always holds                                               |
| Memory read or extraction fails                 | Logged; prompt gets `(empty)`; turn continues                 | Memory is an enhancement, never a dependency                  |
| Message persistence fails                       | Logged; the user still gets the answer                        | A DB hiccup must not cost an answer already on screen         |
| Polar token ingest fails                        | Logged; local counter still recorded                          | Enforcement doesn't depend on the vendor                      |
| Client navigates away mid-stream                | `onStreamSettled('aborted')` releases the lease immediately   | Otherwise held for the 5-minute TTL                           |
| Process dies mid-stream                         | Lease expires after `STREAM_LEASE_TTL_MS` (5 min)             | Backstop, not the mechanism                                   |
| Tool upstream fails                             | Tool returns a typed empty/error result; the model reports it | A tool failure is not a turn failure                          |
| `message.parts` row fails its schema            | Row skipped, `message.parts_invalid` logged                   | Never surface a half-typed record                             |

---

## 14. Known gaps

Recorded here because a design document that only describes the good parts is not useful. Full
detail and exit criteria live in `docs/pro_plan.md`.

| Gap                                                                                                                    | Phase  | Impact                                                              |
| ---------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| **~9.6k LOC of unreachable `components/ai-elements`** (44 of 48 files), plus the dependencies only they pull in        | E      | Bundle size; ~42% of the codebase                                   |
| Thread history still reads from the **LangGraph checkpoint**, not the `message` table; no history pagination in the UI | F      | Whole conversation loads at once; `message` is written and not read |
| No **stop/abort** button; a runaway generation cannot be cancelled and keeps billing                                   | G      | Cost and UX                                                         |
| No **resumable streams** — refreshing mid-answer loses the response                                                    | G      | UX                                                                  |
| **One module-level `Chat` instance** shared by every thread, with a module-level fallback thread id                    | G      | Switching threads mid-stream can cross-contaminate                  |
| Dead controls: composer `+` attachment button, `MessageRenderer` Retry (`onClick={() => {}}`)                          | G      | Shipping a control that does nothing                                |
| Renderer has no `case "reasoning"` — reasoning parts are preserved in history and never displayed                      | G      |                                                                     |
| Turn persistence is **two transactions** (user turn pre-flight, assistant turn from inside the stream)                 | G      | Depends on the abort work to fix properly                           |
| No OTel spans, error tracking, provider retries/circuit breaker, or cost dashboard                                     | H      | Incident response                                                   |
| **No integration tests** for route handlers — blocked on a Clerk session fixture                                       | I      | 140 unit tests cover the pure modules only                          |
| No public landing or pricing page                                                                                      | J      |                                                                     |
| Multi-region: the Postgres-based limiter assumes one region                                                            | D note | Would need per-region counters or a shared store                    |

One small inconsistency worth noting: `lib/env.ts` exports `hasSerpApiKey` and the comment in
`server/chat/tools.ts` says the products tool is omitted when the key is absent — but `tools` is a
static array of all three, and `hasSerpApiKey` has no callers. The tool degrades to an empty result
instead, which is safe; the comment and the export are stale.

---

## 15. Reading path for a new engineer

1. `docs/pro_plan.md` — the _why_ behind almost everything here.
2. `server/lib/route-handler.ts` — how a request becomes typed values.
3. `server/chat/chat-service.ts` — the gate ladder; the heart of the system.
4. `server/chat/agent.ts` — the graph, the model call, and the three `waitUntil` side effects.
5. `lib/ai/model-registry.ts` + `lib/billing/plan-policy.ts` — the two policy files everything else
   derives from.
6. `db/schema/` — four schema files, heavily commented on _why_ each index and each missing foreign
   key is the way it is.
