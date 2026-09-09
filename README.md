# AIChatWave

AIChatWave is a full-stack AI chat application built with Next.js, React, LangGraph, and PostgreSQL. It provides streaming multi-model chat, long-term user memory, tool-powered rich responses, authentication, subscriptions, and usage tracking.

## Features

- Streaming AI chat powered by `@ai-sdk/react`, the AI SDK transport layer, and LangChain/LangGraph.
- Persistent chat threads with per-user ownership checks and server-side conversation history loading.
- LangGraph agent workflow with checkpointing in PostgreSQL.
- Long-term memory using LangGraph `PostgresStore` and OpenAI embeddings.
- Parallel memory extraction so the assistant can remember user preferences without blocking chat responses.
- Dynamic model selection across OpenAI, Google Gemini, and Anthropic Claude.
- Free and Pro model tiers with server-side subscription access checks.
- Tool calling for product search, weather, and finance/news results.
- Custom rich UI cards for tool results, including product carousels, weather cards, and news cards.
- Social-only Clerk authentication (Google, GitHub, LinkedIn) — no passwords are ever handled.
- Polar integration for checkout, customer portal, subscriptions, usage meters, and token usage events.
- Profile page with plan status, billing management, and monthly token usage overview.
- Memory Center page for viewing saved long-term memories.
- Responsive chat workspace with a collapsible sidebar, thread list, model selector, and upgrade CTA.
- Speech input UI support through the prompt input controls.
- Markdown-focused assistant message rendering with copy and retry actions.
- Dark glassmorphism visual design with AIChatWave branding assets.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- AI SDK 6
- LangChain and LangGraph
- Drizzle ORM
- PostgreSQL with pgvector
- Clerk
- Polar
- TanStack Query and TanStack Form
- Zustand
- Radix/shadcn-style UI components

## Core Architecture

### Chat Flow

The client uses `useChat` with a custom `DefaultChatTransport` in `store/chat-store.ts`. Messages are sent to `app/api/chat/route.ts`, where the API route:

- Verifies the active Clerk session.
- Creates a thread if it does not already exist.
- Confirms the thread belongs to the current user.
- Resolves the selected model and checks subscription access for Pro-only models.
- Streams LangGraph events back as AI SDK UI message streams.

### LangGraph Agent

The graph in `server/chat/agent.ts` contains three main nodes:

- `callLlm`: injects user memories, calls the selected model, binds tools, and records token usage with Polar.
- `tools`: executes tool calls requested by the model.
- `memoryRememberNode`: extracts durable user facts from the latest message and stores them in the vector store.

The graph uses `PostgresSaver` for conversation checkpoints and `PostgresStore` for long-term memory.

### Long-Term Memory

Long-term memory is stored per user under the namespace `[userId, "memories"]`. The app uses OpenAI `text-embedding-3-small` embeddings with a 1536-dimensional pgvector index. Saved memories are injected into the system prompt for personalized responses and can be viewed in the Memory Center.

## AI Models

Configured models live in `lib/ai/model-registry.ts` (client-safe data) and are instantiated in `server/ai/model-service.ts`.

| Model                      | Provider  | Tier |
| -------------------------- | --------- | ---- |
| `gpt-5-mini`               | OpenAI    | Free |
| `gpt-5-nano`               | OpenAI    | Free |
| `gemini-3.1-pro`           | Google    | Pro  |
| `claude-sonnet-4-20250514` | Anthropic | Pro  |

The app falls back to `gpt-5-nano` when an unknown or missing model id is provided.

## Agent Tools

AIChatWave exposes these LangChain tools to the agent:

- `display_products`: searches Google Shopping via SerpAPI and renders product results in a carousel.
- `display_weather`: resolves a location with Open-Meteo geocoding and displays current, hourly, and daily weather details.
- `display_news`: fetches and ranks finance, market, geopolitical, stock, crypto, or company headlines from Yahoo Finance.

Tool outputs are rendered by `components/custom/message-renderer.tsx` using purpose-built UI components in `components/gen-ui`.

## Authentication And Billing

Authentication is handled by **Clerk**, and is **social-only by design**: users sign in with
Google, GitHub, or LinkedIn. There is no email/password form, no password reset, and no
verification codes — the app never handles a credential. Providers are enabled in the Clerk
dashboard rather than in this repo, so it holds no OAuth client secrets of its own either.

Key pieces:

- `proxy.ts` — `clerkMiddleware()` with **no** route matching. Clerk deprecates
  `createRouteMatcher()` gating because middleware auth can be bypassed (Server Functions are
  invoked by id, not path). Authorization lives on the resources instead.
- `app/(chat)/layout.tsx` — `await auth.protect()` guards every page in the chat segment.
- `server/lib/route-handler.ts` — every API route requires a session unless it opts out through
  `createPublicRouteHandler`.
- `server/auth/user-service.ts` — mirrors Clerk identities into the local `user` table.
- `app/api/webhooks/clerk/route.ts` — keeps that mirror current.
- `app/sign-in`, `app/sign-up` — Clerk's widgets inside this app's branded shell
  (`components/auth/auth-screen-shell.tsx`).

### Why the local `user` table still exists

`thread.user_id` and `subscription.user_id` reference `user.id`, which holds the **Clerk user id
verbatim**. Webhook delivery is asynchronous, so a brand-new user can send their first message
before `user.created` arrives. Provisioning is therefore just-in-time and idempotent
(`ensureUserProvisioned`) on the write paths that need the row, with the webhook keeping it
current afterwards.

Billing uses Polar. It was previously wired in through the `@polar-sh/better-auth` plugin, which
provided `authClient.checkout()` and `authClient.customer.portal()`. That plugin does not exist for
Clerk, so both flows are now server-owned:

- `POST /api/billing/checkout` — creates a Pro checkout and returns its URL. The product id comes
  from validated env on the server, so the client cannot ask to be billed for something else.
- `POST /api/billing/portal` — returns a Polar customer-portal URL.
- Polar customers are created from the `user.created` webhook, keyed by Clerk user id as
  `externalCustomerId`.
- Active-subscription checks, usage meters, and `llm_tokens` usage ingestion are unchanged.

## Database

The app uses PostgreSQL for the local user mirror, chat threads and messages, subscriptions, LangGraph checkpoints, and vector memory storage. Sessions live in Clerk, not here.

Local development can use the included Docker Compose service:

```bash
docker compose up -d
```

The compose file runs `pgvector/pgvector:pg16` on port `5432`.

Drizzle schema files are located in `db/schema`, and migrations are stored in `drizzle`.

## Environment Variables

Copy `.env.example` to `.env` and fill it in — it documents every variable and which feature each
one unlocks.

```bash
cp .env.example .env
```

Notes:

- `DATABASE_URL` is required for Drizzle, LangGraph checkpoints, and long-term memory.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are required for authentication.
  There are no OAuth client secrets in this app any more — providers are enabled in the Clerk
  dashboard.
- `CLERK_WEBHOOK_SIGNING_SECRET` is optional until a webhook endpoint is configured; without it,
  `/api/webhooks/clerk` returns 503 and user sync relies on just-in-time provisioning alone.
- `OPENAI_API_KEY` is required for OpenAI models, structured memory extraction, and embeddings.
- `GOOGLE_API_KEY` is required for Gemini Pro; `ANTHROPIC_API_KEY` for Claude.
- `SERP_API_KEY` is required for product search.
- `POLAR_ACCESS_TOKEN` / `POLAR_PRODUCT_ID` are required for checkout, portal, and usage tracking.
  `POLAR_PRODUCT_ID` no longer has a hardcoded fallback and must be set explicitly.
- `POLAR_SERVER` selects which Polar system to talk to and **must be set explicitly when
  `NODE_ENV=production`**. Sandbox and production are separate systems — separate dashboards
  (`sandbox.polar.sh` vs `polar.sh`), separate tokens, separate product ids. A token from one
  returns `401 invalid_token` against the other, which reaches users as a failed checkout.
  Running `POLAR_SERVER=sandbox` on a live deployment is supported and normal pre-launch, but
  sandbox accepts test cards only and moves no real money.

Run `pnpm polar:doctor` after any billing credential change. It is read-only, creates nothing, and
reports whether the token is valid, whether it matches `POLAR_SERVER`, and whether
`POLAR_PRODUCT_ID` exists and is unarchived in that environment.

## Getting Started

Install dependencies:

```bash
pnpm install
```

Start PostgreSQL locally if needed:

```bash
docker compose up -d
```

Run database migrations:

```bash
pnpm migration:migrate
```

Start the development server:

```bash
pnpm dev
```

Open `http://localhost:3000` in your browser.

## Scripts

```bash
pnpm dev                 # Start the Next.js dev server
pnpm build               # Build for production
pnpm start               # Start the production server
pnpm lint                # Run ESLint
pnpm format              # Format files with Prettier
pnpm format:check        # Check formatting
pnpm migration:generate  # Generate Drizzle migrations
pnpm migration:migrate   # Apply Drizzle migrations
```

## Important Paths

- `proxy.ts`: Clerk middleware (no auth gating — see Authentication And Billing).
- `server/lib/route-handler.ts`: the typed wrapper every API route is built from.
- `server/chat/agent.ts`: LangGraph workflow, LLM calls, tools, memory, and usage tracking.
- `server/chat/chat-service.ts`: thread access, model access, and stream orchestration.
- `server/chat/thread-service.ts`: thread list, create, rename, delete, and history.
- `server/chat/tools.ts`: product, weather, and news tools.
- `server/db/`: repositories — the only modules that build queries.
- `server/auth/session.ts`: Clerk session resolution.
- `server/auth/user-service.ts`: Clerk → local user mirror.
- `server/billing/`: subscription checks, usage ingestion, checkout, and portal.
- `server/memory/memory-service.ts`: long-term memory read, search, write, and delete.
- `lib/ai/model-registry.ts`: model ids, providers, and plan tiers (client-safe).
- `lib/ai/message-parts.ts`: the persisted shape of message content.
- `lib/api/contracts.ts` / `lib/api/client.ts`: the HTTP wire contract, parsed on both sides.
- `components/chat/`: chat shell, composer, and message list.
- `components/custom/message-renderer.tsx`: message and tool result rendering.
- `components/auth/auth-screen-shell.tsx`: branded frame around Clerk's auth widgets.
- `app/(chat)/memories/page.tsx`: Memory Center.
- `app/(chat)/profile/page.tsx`: profile, subscription, billing, and usage dashboard.
- `db/schema`: Drizzle schemas.
- `docs/pro_plan.md`: the phased production-hardening plan.

## Current Project Notes

- Authentication is enforced per resource (page layout, API route, server action, and repository
  query), not in middleware.
- The chat route enforces authentication and prevents users from posting to threads they do not own.
- Historical conversation loading also checks that the requested thread belongs to the active user.
- Pro model access is checked both in the UI and on the server.
- Token usage is sent to Polar asynchronously after model responses.
- Memory extraction failures are treated as non-fatal so chat responses can continue.
