# AIChatWave Next-Level Product Plan: 30 Days

This plan is based on the current codebase audit plus external research on production LLM apps, AI chat UX, LLMOps, observability, evals, safety, and reliability. The goal is not to add random features. The goal is to turn AIChatWave from a promising prototype into a polished, trustworthy, type-safe, production-ready AI product.

Important assumption: this is still dev-stage, so database backward compatibility is not required. We can redesign tables, delete old tables, regenerate migrations, and rebuild the data model from scratch if that gives a cleaner product.

## Product Direction

AIChatWave should become a premium AI workspace, not just another chat wrapper.

Positioning:

- Personal AI workspace with long-term memory, tool-powered answers, reliable multi-model chat, and rich responses.
- Fast, beautiful, reliable, transparent, and safe enough that users trust it for real work.
- Differentiation should come from polished UX, memory quality, trustworthy sources, excellent streaming, and measurable AI quality.

Non-negotiable engineering standard:

- 100% strict TypeScript.
- No `any`.
- No unsafe type assertions for app/domain data.
- All API inputs validated with schemas.
- All tool outputs validated with schemas.
- All environment variables validated at boot.
- All database reads/writes typed through Drizzle and domain services.
- All critical flows covered by tests.
- No silent failures except where intentionally non-fatal and logged with context.

## Current Audit Summary

Current strengths:

- Modern stack: Next.js 16, React 19, AI SDK 6, LangGraph, Drizzle, PostgreSQL, Better Auth, Polar, Tailwind 4.
- Streaming chat exists.
- Persistent threads exist.
- Long-term memory exists with pgvector/LangGraph store.
- Model selector and free/pro gating exists.
- Tool calling exists for products, weather, and news.
- Rich cards exist for tool outputs.
- Auth, subscriptions, billing portal, and usage tracking exist.
- Basic profile and memory pages exist.

Current risks:

- Chat API accepts raw `req.json()` without runtime validation.
- `app/api/chat/graph.ts` uses `runtime: any` and type assertions for model/user context.
- Several UI and integration files contain type assertions that should be replaced with typed guards or wrapper components.
- Environment variables are accessed directly and sometimes cast as strings.
- No tests found for API, tools, DB services, memory, auth access, or chat UI behavior.
- No CI workflow found.
- No rate limiting, abuse control, or per-plan quota enforcement beyond model access.
- No centralized logging, tracing, LLM observability, or eval workflow.
- No clear domain service layer; route handlers directly mix auth, DB, billing, and agent orchestration.
- Chat scroll is fragile because scroll state is split between `Conversation`, `ConversationContent`, and `ConversationAutoScroll` with multiple event handlers.
- Tool schemas are partial; external API responses are not fully normalized before rendering.
- DB model is too thin for serious product analytics, quotas, feedback, attachments, shared chats, and message-level metadata.
- ESLint disables several rules and does not explicitly ban `any`/unsafe assertions.
- Product UX is attractive but still lacks trust-building features like sources, answer feedback, retry variants, status clarity, prompt starters, and error recovery.

## Core Product Pillars

1. Reliability: chat should stream, scroll, recover, retry, and persist correctly every time.
2. Type safety: every boundary should be validated and typed, including requests, env, tools, DB, model registry, and stream events.
3. Trust: sources, citations, tool transparency, feedback, memory controls, and safety states.
4. Speed: fast initial load, responsive input, smooth streaming, optimized DB queries, and background jobs.
5. Differentiation: memory that users can control, polished rich outputs, model intelligence, and workflow-oriented features.
6. Operability: logs, traces, evals, analytics, error reporting, CI, and production runbooks.

## Database Redesign Target

Because dev-stage DB resets are allowed, design the database around product needs instead of patching the current schema.

Recommended tables:

- `users`: Better Auth user table remains source of identity.
- `accounts`, `sessions`, `verification`: Better Auth tables.
- `workspaces`: future-ready personal/team workspace boundary.
- `workspace_members`: user role in workspace.
- `threads`: chat conversation metadata, ownership, visibility, title, archived/pinned state.
- `messages`: canonical persisted messages with role, parts JSON, model id, status, parent/branch info, token counts.
- `message_parts`: optional normalized table if JSON parts become hard to query.
- `tool_calls`: tool name, input, output, status, latency, error, linked message.
- `memories`: user/workspace memory facts with source message, confidence, status, embedding id, created/updated timestamps.
- `memory_events`: audit trail for memory create/update/delete/merge.
- `model_usage_events`: input/output/total tokens, provider, model, cost estimate, latency, request id.
- `feedback`: thumbs up/down, reason, free text, linked message/thread.
- `attachments`: uploaded file metadata, storage key, MIME type, size, extracted text status.
- `plans`: normalized plan metadata if Polar data needs local cache.
- `subscriptions`: local subscription cache for fast access checks.
- `rate_limits`: optional DB-backed counters if Redis is not introduced.
- `audit_events`: security and billing-sensitive events.

Indexes to add:

- `threads(user_id, updated_at desc)`.
- `threads(workspace_id, updated_at desc)`.
- `messages(thread_id, created_at asc)`.
- `tool_calls(message_id)`.
- `memories(user_id, status, updated_at desc)`.
- Vector index for memory embeddings.
- `model_usage_events(user_id, created_at desc)`.
- `feedback(message_id)`.

Schema principle:

- Keep external provider payloads in typed JSON columns only after validating them.
- Store canonical app data in first-class columns when it drives product behavior.

## 30-Day Execution Plan

### Days 1-3: Stabilize Chat UX And Scrolling

Status: completed and verified with `pnpm test`, `pnpm lint`, and `pnpm tsc --noEmit`.

Goal: make the core chat feel premium before adding features.

Tasks:

- Fix chat scroll architecture with one clear scroll owner.
- Replace split scroll event handling with a single hook such as `useChatScrollController`.
- Preserve user scroll position when reading old messages.
- Auto-scroll only when user is already near bottom or when a new user message is submitted.
- Keep streaming assistant output anchored smoothly at bottom.
- Add visible states: submitted, streaming, tool running, error, retry available.
- Fix mobile viewport behavior with keyboard open.
- Add prompt starter cards on empty state instead of only generic placeholder.
- Wire speech input result into the prompt input or hide it until fully working.
- Disable submit while empty, but support Cmd/Ctrl+Enter and Shift+Enter correctly.

Acceptance criteria:

- Long conversations scroll naturally on desktop and mobile.
- User can scroll up during streaming without being forced to bottom.
- New submitted message scrolls into view instantly.
- Input stays fixed and never overlaps final assistant content.
- No hydration flicker in chat history.

Key files:

- `components/chat-interface.tsx`
- `components/chat/chat-shell.tsx`
- `components/chat/chat-message-list.tsx`
- `components/chat/chat-composer.tsx`
- `components/chat/hooks/use-chat-scroll-controller.ts`
- `components/chat/hooks/use-chat-viewport.ts`
- `components/ai-elements/conversation.tsx`
- `components/ai-elements/conversation-auto-scroll.tsx`

### Days 4-6: Type-Safety Foundation

Goal: remove unsafe boundaries and stop future type debt.

Tasks:

- Add `lib/env.ts` with Zod validation for all environment variables.
- Replace direct `process.env.*` usage with typed env access.
- Add `app/api/chat/schema.ts` for request validation.
- Validate `threadId`, `messageContent`, and `selectedModel` before using them.
- Replace `runtime: any` in LangGraph with a typed runtime context.
- Export `ModelId` and make selected model flow typed end-to-end.
- Replace unsafe casts in model selector, chat page params, speech input, prompt input, and UI wrappers with guards/helpers where feasible.
- Update ESLint to ban `any` and unsafe assertions in app-owned code.
- Add `pnpm typecheck` script.

Acceptance criteria:

- `pnpm typecheck` passes.
- `pnpm lint` passes with stricter no-explicit-any rule.
- Chat API returns typed 400 errors for invalid payloads.
- No `any` in app-owned business logic.

Key files:

- `app/api/chat/route.ts`
- `app/api/chat/graph.ts`
- `app/api/chat/model.ts`
- `lib/auth.ts`
- `eslint.config.mjs`
- `tsconfig.json`

### Days 7-9: Backend Architecture Refactor

Status: completed and verified with `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

Goal: separate route handlers from business logic.

Tasks:

- Create `server/chat/chat-service.ts` for thread creation, ownership checks, title generation, and message orchestration.
- Create `server/billing/subscription-service.ts` for plan/model access.
- Create `server/ai/model-service.ts` for model registry and provider setup.
- Create `server/memory/memory-service.ts` for memory read/write/search.
- Create a typed app error format with status codes and safe client messages.
- Ensure route handlers only parse input, call services, and return responses.
- Replace `console.error` with structured logger wrapper.
- Add request ids for API and LLM calls.

Acceptance criteria:

- `app/api/chat/route.ts` is small and mostly orchestration-free.
- Billing failures and model access failures are consistent.
- Memory failures remain non-fatal but are logged with request/user/thread context.

### Days 10-12: Database Redesign And Persistence

Goal: build a product-grade data model.

Tasks:

- Redesign Drizzle schema based on the database target above.
- Drop/recreate dev migrations if needed.
- Persist messages explicitly in app tables, not only through LangGraph checkpointing.
- Store message status: `submitted`, `streaming`, `completed`, `failed`, `cancelled`.
- Store model id, provider, latency, token counts, and error metadata per assistant message.
- Store tool calls separately with validated input/output.
- Add thread archive, pin, title, updatedAt, and soft delete fields.
- Add memory source links and memory status: `active`, `archived`, `rejected`.

Acceptance criteria:

- Fresh DB can be created from migrations.
- Thread list loads from indexed app tables.
- Chat history loads from canonical `messages` table.
- LangGraph checkpointing can remain for agent state, but app UX should not depend on it as the only history source.

### Days 13-15: Tools, Memory, And Trust Layer

Goal: make tool and memory behavior reliable and understandable.

Tasks:

- Define Zod schemas for each tool input and output.
- Normalize SerpAPI, Open-Meteo, and Yahoo Finance responses into typed app DTOs.
- Add per-tool timeout, retry, and graceful error messages.
- Add tool execution status UI: searching products, fetching weather, reading market news.
- Add source/citation support for news and web-like outputs.
- Add memory settings: view, delete, disable memory, and approve/reject new memory.
- Add memory extraction confidence and deduplication.
- Improve system prompts to clarify tool usage, citations, and memory rules.

Acceptance criteria:

- Tool cards never crash on missing external API fields.
- User can inspect what memory was used or saved.
- Assistant clearly distinguishes model answer from tool-backed facts.

### Days 16-18: Testing And CI

Goal: stop regressions before they ship.

Tasks:

- Add test runner suitable for the stack, preferably Vitest for unit tests.
- Add React Testing Library for component behavior.
- Add Playwright for end-to-end chat flows.
- Add unit tests for model registry, env validation, chat request schema, subscription access, memory helpers, tool normalization.
- Add component tests for chat scrolling, input submit behavior, model selector gating, message renderer.
- Add e2e tests: sign in, create chat, stream response mock, load old thread, unauthorized thread blocked.
- Add GitHub Actions workflow for lint, typecheck, tests, and build.

Acceptance criteria:

- CI runs on every PR.
- Core chat flow has at least one deterministic e2e test.
- Type/lint/test/build are all required before merging.

### Days 19-21: Production LLMOps And Observability

Goal: understand quality, cost, and failure modes.

Tasks:

- Add structured logging with request id, user id, thread id, model id, latency, token usage.
- Add LLM trace abstraction so provider calls, tool calls, and memory operations are visible.
- Add cost estimation per response.
- Add dashboard-ready usage events in DB, not only Polar ingestion.
- Add eval dataset format for golden prompts.
- Add offline eval script to compare model responses across model/provider changes.
- Add feedback capture on every assistant message.
- Add error taxonomy: provider error, timeout, validation error, auth error, quota error, tool error.

Acceptance criteria:

- For any bad answer, we can inspect prompt, model, tools, memory, latency, tokens, and feedback.
- There is a repeatable eval command before changing prompts/tools/models.

### Days 22-24: Premium UX And Product Features

Goal: move from functional chat to impressive product.

Tasks:

- Add better empty state with use-case templates: code, research, compare products, market update, planning.
- Add message actions: copy, retry, edit-and-resend, branch from message, thumbs up/down.
- Add thread search, archive, pin, rename, delete.
- Add shareable read-only chat links if product positioning supports it.
- Add answer regeneration with model switch.
- Add rich markdown polish: tables, code copy, citations, collapsible tool details.
- Add keyboard shortcuts and command menu.
- Add loading skeletons for thread list/profile/memory.
- Add responsive QA pass for mobile, tablet, desktop.

Acceptance criteria:

- Product feels complete to a first-time user within 2 minutes.
- Existing users can organize and revisit work easily.
- Message-level actions are discoverable and reliable.

### Days 25-26: Plans, Quotas, Security, And Abuse Control

Goal: make monetization and platform protection credible.

Tasks:

- Add per-plan limits: messages/day, tokens/month, premium models, memory size, tool usage.
- Enforce quotas server-side.
- Add rate limiting for chat, auth-sensitive actions, and tools.
- Add provider key failure handling and model fallback policy.
- Add prompt injection and tool safety guardrails where tools touch external URLs or user-controlled data.
- Add audit events for billing, subscription changes, memory deletes, and account actions.
- Add secure webhook validation for Polar if not already complete.

Acceptance criteria:

- Free/pro limits are clearly communicated in UI and enforced in backend.
- Abuse cannot create unlimited provider cost.
- Security-sensitive flows are auditable.

### Days 27-28: Performance And Accessibility

Goal: polish the product for real users.

Tasks:

- Run bundle analysis and reduce client bundle where possible.
- Move server-only logic out of client boundaries.
- Audit React re-renders in chat, message renderer, and sidebar.
- Virtualize long message lists if needed.
- Optimize DB queries for thread list and message history.
- Add accessibility labels, focus management, aria-live behavior, and keyboard navigation.
- Validate color contrast in dark theme.
- Test with reduced motion.

Acceptance criteria:

- Chat remains smooth with 200+ messages.
- Lighthouse/accessibility issues are addressed for primary pages.
- Mobile input and scrolling are stable.

### Days 29-30: Launch Readiness And Final QA

Goal: ship with confidence.

Tasks:

- Create production readiness checklist.
- Add `.env.example` with all required variables and descriptions.
- Add setup docs for DB, migrations, auth, Polar, and model providers.
- Add runbook for common failures: provider outage, DB migration failure, Polar failure, memory store failure.
- Run full manual QA across auth, chat, model gating, tools, memory, billing, profile, mobile.
- Fix high-priority bugs only; avoid starting new features.
- Prepare demo script and screenshots.

Acceptance criteria:

- New developer can run the project from docs.
- Product demo works end to end without manual hacks.
- Known issues are documented and prioritized.

## Feature Backlog After 30 Days

High-impact features:

- File upload and document chat.
- Web search with cited answers.
- Workspace/team accounts.
- Personal knowledge base with source management.
- Prompt library and reusable workflows.
- Multi-chat projects.
- Agent mode with visible plan, steps, and approvals.
- Voice conversation mode.
- Browser extension or share-to-AIChatWave capture.
- Export chat to Markdown/PDF.
- Public gallery of shareable AI outputs.

Advanced features:

- Model router that chooses best model based on task and plan.
- Cost-aware fallback model selection.
- Memory graph with entities and preferences.
- User-controlled AI profile: tone, stack, goals, constraints.
- Tool marketplace architecture.
- Admin dashboard for usage, errors, feedback, and revenue.

## Refactoring Priority List

Priority 0: must fix immediately.

- Chat scrolling and input layout.
- API request validation.
- Env validation.
- Remove `runtime: any` from graph.
- Type model ids end to end.
- Add typecheck script.

Priority 1: before adding many features.

- Backend service layer.
- Database redesign.
- Persist canonical messages.
- Tool output schemas.
- Tests and CI.
- Structured error handling.

Priority 2: product quality.

- Feedback capture.
- Memory controls.
- Message actions.
- Thread management.
- Observability and evals.
- Rate limits and quotas.

Priority 3: differentiation.

- File/document chat.
- Web search with citations.
- Projects/workspaces.
- Agent workflow UI.
- Model router.

## Type-Safety Rules For This Project

Rules:

- Do not use `any` in app-owned code.
- Do not use `as string` for environment variables.
- Do not use `as SomeDomainType` after parsing JSON; validate with Zod instead.
- Type assertions are allowed only for narrow UI/library interop cases where no safer API exists, and must be isolated in tiny helper functions.
- API handlers must parse unknown input through schemas.
- External API responses must be treated as unknown and parsed.
- DB JSON fields must have schemas at read/write boundaries.
- Model registry must be the single source of truth for model ids, provider, plan tier, and display metadata.

Suggested lint direction:

- Enable `@typescript-eslint/no-explicit-any`.
- Enable `@typescript-eslint/no-unsafe-assignment` if parser setup allows it.
- Enable `@typescript-eslint/no-unsafe-member-access` if parser setup allows it.
- Keep escape hatches rare and documented.

## Quality Metrics To Track

Engineering:

- Typecheck pass rate.
- Test coverage for domain services.
- Build time and bundle size.
- API error rate.
- Chat stream failure rate.
- Average response latency.
- Tool call latency and failure rate.

AI quality:

- User feedback score per model.
- Retry/regenerate rate.
- Tool usefulness score.
- Memory accept/reject rate.
- Eval pass rate on golden prompts.
- Hallucination reports.

Business/product:

- Activation rate: first successful chat.
- Day-1 and day-7 retention.
- Free-to-pro conversion.
- Messages per active user.
- Premium model usage.
- Billing failure rate.

## Challenge To The Product Direction

Do not try to compete by adding every AI feature at once. That creates a messy product.

The winning path should be:

- First, make chat reliability and UX excellent.
- Second, make type safety and backend architecture boring and strong.
- Third, make memory genuinely useful and controllable.
- Fourth, make tool-backed answers trustworthy with sources and feedback.
- Fifth, add premium workflows that make users come back.

If a feature does not improve trust, speed, reliability, retention, or revenue, delay it.

## Immediate Next Step

Start with Days 1-3. Fix chat scrolling, input behavior, and visible streaming/error states. This is the front door of the product. If this feels broken, users will not care how advanced the backend is.
