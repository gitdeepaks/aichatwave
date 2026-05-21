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
- Better Auth authentication with email/password, Google, and GitHub sign-in.
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
- Better Auth
- Polar
- TanStack Query and TanStack Form
- Zustand
- Radix/shadcn-style UI components

## Core Architecture

### Chat Flow

The client uses `useChat` with a custom `DefaultChatTransport` in `store/chat-store.ts`. Messages are sent to `app/api/chat/route.ts`, where the API route:

- Verifies the active Better Auth session.
- Creates a thread if it does not already exist.
- Confirms the thread belongs to the current user.
- Resolves the selected model and checks subscription access for Pro-only models.
- Streams LangGraph events back as AI SDK UI message streams.

### LangGraph Agent

The graph in `app/api/chat/graph.ts` contains three main nodes:

- `callLlm`: injects user memories, calls the selected model, binds tools, and records token usage with Polar.
- `tools`: executes tool calls requested by the model.
- `memoryRememberNode`: extracts durable user facts from the latest message and stores them in the vector store.

The graph uses `PostgresSaver` for conversation checkpoints and `PostgresStore` for long-term memory.

### Long-Term Memory

Long-term memory is stored per user under the namespace `[userId, "memories"]`. The app uses OpenAI `text-embedding-3-small` embeddings with a 1536-dimensional pgvector index. Saved memories are injected into the system prompt for personalized responses and can be viewed in the Memory Center.

See `LONG_TERM_MEMORY_GUIDE.md` for the detailed implementation walkthrough.

## AI Models

Configured models live in `app/api/chat/model.ts`.

| Model | Provider | Tier |
| --- | --- | --- |
| `gpt-5-mini` | OpenAI | Free |
| `gpt-5-nano` | OpenAI | Free |
| `gemini-3.1-pro` | Google | Pro |
| `claude-sonnet-4-20250514` | Anthropic | Pro |

The app falls back to `gpt-5-nano` when an unknown or missing model id is provided.

## Agent Tools

AIChatWave exposes these LangChain tools to the agent:

- `display_products`: searches Google Shopping via SerpAPI and renders product results in a carousel.
- `display_weather`: resolves a location with Open-Meteo geocoding and displays current, hourly, and daily weather details.
- `display_news`: fetches and ranks finance, market, geopolitical, stock, crypto, or company headlines from Yahoo Finance.

Tool outputs are rendered by `components/custom/message-renderer.tsx` using purpose-built UI components in `components/gen-ui`.

## Authentication And Billing

Authentication is configured in `lib/auth.ts` with Better Auth and Drizzle/Postgres. Supported login methods are:

- Email and password
- Google OAuth
- GitHub OAuth

Billing and subscription features use Polar:

- Customer creation on sign-up
- Pro checkout flow
- Customer billing portal
- Active subscription checks
- Usage meter lookup
- Token usage event ingestion under the `llm_tokens` event name

## Database

The app uses PostgreSQL for auth data, chat threads, LangGraph checkpoints, and vector memory storage.

Local development can use the included Docker Compose service:

```bash
docker compose up -d
```

The compose file runs `pgvector/pgvector:pg16` on port `5432`.

Drizzle schema files are located in `db/schema`, and migrations are stored in `drizzle`.

## Environment Variables

Create a `.env` file with the values required by the integrations you use.

```bash
DATABASE_URL=
OPENAI_API_KEY=
GOOGLE_API_KEY=
ANTHROPIC_API_KEY=
SERP_API_KEY=
BETTER_AUTH_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
POLAR_ACCESS_TOKEN=
```

Notes:

- `DATABASE_URL` is required for Drizzle, Better Auth, LangGraph checkpoints, and long-term memory.
- `OPENAI_API_KEY` is required for OpenAI models, structured memory extraction, and embeddings.
- `GOOGLE_API_KEY` is required for Gemini Pro.
- `ANTHROPIC_API_KEY` is required for Claude.
- `SERP_API_KEY` is required for product search.
- OAuth variables are required only when Google or GitHub sign-in is enabled.
- `POLAR_ACCESS_TOKEN` is required for subscriptions, checkout, billing portal, and usage tracking.

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

- `app/api/chat/route.ts`: chat API route, access checks, model access, and stream response.
- `app/api/chat/graph.ts`: LangGraph workflow, LLM calls, tools, memory, and usage tracking.
- `app/api/chat/model.ts`: model registry and dynamic model creation.
- `app/api/chat/tools.ts`: product, weather, and news tools.
- `components/chat-interface.tsx`: main chat UI.
- `components/input-container.tsx`: prompt input and thread creation behavior.
- `components/model-selector.tsx`: model picker and Pro model locking.
- `components/custom/message-renderer.tsx`: message and tool result rendering.
- `app/(chat)/memories/page.tsx`: Memory Center.
- `app/(chat)/profile/page.tsx`: profile, subscription, billing, and usage dashboard.
- `lib/auth.ts`: Better Auth and Polar setup.
- `lib/store.ts`: LangGraph vector memory store.
- `lib/conversation.ts`: server-side thread history loading.
- `db/schema`: Drizzle schemas.

## Current Project Notes

- The chat route enforces authentication and prevents users from posting to threads they do not own.
- Historical conversation loading also checks that the requested thread belongs to the active user.
- Pro model access is checked both in the UI and on the server.
- Token usage is sent to Polar asynchronously after model responses.
- Memory extraction failures are treated as non-fatal so chat responses can continue.
