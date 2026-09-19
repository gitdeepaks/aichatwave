# Contributing

Everything you need between `git clone` and a running app, and then the rules the code is held to.

If a step here is wrong or missing, that is a bug in this file — fix it in the same PR as whatever
you were doing when you found it.

---

## 1 · Prerequisites

| Tool   | Version | Why                                                                |
| ------ | ------- | ------------------------------------------------------------------ |
| Node   | ≥ 22    | `engines.node` in `package.json`; CI runs 22                       |
| pnpm   | 10.9.0  | `packageManager` pins it — `corepack enable` is enough             |
| Docker | any     | Only for the local Postgres. Skip it if you point at a remote one. |

```bash
corepack enable
node --version   # v22 or newer
```

---

## 2 · Clone and install

```bash
git clone <this repo>
cd aichatwave
pnpm install
```

---

## 3 · Database

The app needs **Postgres with the `pgvector` extension** — not plain Postgres. The LangGraph memory
store creates `vector` columns, so a server without the extension fails rather than degrading.

```bash
docker compose up -d db
```

That starts `pgvector/pgvector:pg16` on `localhost:5432` with `postgres` / `postgres`, which is the
same image CI uses. If you would rather use a hosted database, any Postgres with pgvector works —
[Neon](https://neon.tech) is what production runs on, and `db/index.ts` picks the right driver from
the host automatically (`*.neon.tech` → Neon's serverless pool, anything else → `pg` over TCP).

---

## 4 · Environment

```bash
cp .env.example .env
```

`.env.example` documents every variable and what it unlocks. Five are required to boot:

| Variable                                  | Where to get it                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                            | `postgresql://postgres:postgres@localhost:5432/postgres` for the compose service                                      |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`       | dashboard.clerk.com → API keys                                                                                        |
| `CLERK_SECRET_KEY`                        | same page                                                                                                             |
| `OPENAI_API_KEY`                          | platform.openai.com — required even if you only use Claude, because memory extraction and the embeddings are OpenAI's |
| `POLAR_ACCESS_TOKEN` + `POLAR_PRODUCT_ID` | sandbox.polar.sh → create a product, then issue a token                                                               |

`lib/env.ts` validates the whole environment as an import side effect, so a missing or malformed
value fails at boot with a message naming it rather than at the first request that needed it.

**Clerk setup**, once, in the dashboard: enable Google, GitHub and LinkedIn as sign-in methods, and
disable email/password — the app is social-only by decision
([ADR-0006](docs/adr/0006-social-only-authentication.md)) and the auth screen's CSS assumes it.

**What you can skip.** `GOOGLE_API_KEY` and `ANTHROPIC_API_KEY` are optional — without them those
models return a typed 503 if selected, and everything else works. `SERP_API_KEY` is optional — the
product-search tool is simply not offered to the model. The two webhook secrets are optional; their
endpoints return 503 until set.

---

## 5 · Migrate

```bash
pnpm migration:migrate
```

This runs the Drizzle migrations in `drizzle/` **and** `pnpm db:setup:langgraph`, which creates the
checkpoint tables and the pgvector store. Both are needed; the second is easy to forget because
nothing fails until the first chat message.

---

## 6 · Run

```bash
pnpm dev
```

`http://localhost:3000` is the public landing page. `/app` is the workspace and will redirect you to
sign-in.

---

## 7 · Verify your setup

Run the same gate CI runs:

```bash
pnpm format:check
pnpm lint            # --max-warnings=0
pnpm typecheck
pnpm test
pnpm build
```

All five should pass on a clean checkout. If they do, your environment is right.

---

## Working on the code

### The commands

| Command                   | What it does                                                           |
| ------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                | Dev server                                                             |
| `pnpm test`               | Whole suite; DB-backed tests **skip** with a reason if no Postgres     |
| `pnpm test:integration`   | Only the DB-backed suites, and **fails** rather than skips without one |
| `pnpm test:coverage`      | Everything plus the per-area coverage gate                             |
| `pnpm lint` / `typecheck` | As CI runs them                                                        |
| `pnpm format`             | Prettier, write mode                                                   |
| `pnpm migration:generate` | Generate a migration from a schema change                              |
| `pnpm migration:migrate`  | Apply migrations + LangGraph setup                                     |
| `pnpm db:reset`           | **Destructive.** Drops and recreates everything.                       |
| `pnpm polar:doctor`       | Checks the Polar credential and product actually work                  |
| `pnpm bundle:check`       | Client bundle budget                                                   |

### Tests

`node --test` with `tsx`, no test framework. Files live in `tests/`:

- `tests/*.test.ts` — pure functions. No database, no network, always run.
- `tests/integration/` — real HTTP route calls against a real Postgres.
- `tests/service/` — service functions against a real Postgres.

The DB-backed suites build their database **from this repository's own `drizzle/*.sql`**, one
database per test file. So a wrong migration fails in the test run rather than on deploy.

Without a Postgres they skip with a reason, which keeps `pnpm test` runnable on a laptop.
`TEST_REQUIRE_DATABASE=1` turns that skip into a failure — `pnpm test:integration` sets it, and so
does CI, because a suite that silently skips itself in CI is worse than no suite.

Third-party edges (Clerk's `auth()`, the Polar SDK, OpenAI, the memory store) are replaced by
seeding `require.cache` via `tests/helpers/module-stub.ts`. Its one rule: **stub before the subject
is imported**, which in practice means reaching the subject through `await import(...)` inside the
test rather than at the top of the file.

### Coverage

`scripts/check-coverage.ts` gates `server/` and `lib/` separately, because they are different kinds
of code — `lib/` is nearly all pure functions, `server/` reaches providers and the OTel SDK. The
thresholds are a **ratchet**: raise them when the real number moves, never lower one to make a build
pass.

---

## The rules the code is held to

These are enforced by the linter, not by review, so you will meet them immediately.

**No `any`, in any form.** Including one that arrives from a dependency's types — the
`@typescript-eslint/no-unsafe-*` family catches those in arguments, assignments, calls, returns and
member access.

**No type assertions at all.** `consistent-type-assertions` is set to `assertionStyle: "never"`, and
`no-non-null-assertion` is on. If you need to narrow, narrow — with a guard, a schema, or a
`switch`.

**`unknown` is an input and nothing else.** A custom rule,
`eslint-rules/unknown-parse-boundary.mjs`, allows it in exactly three places: a parameter's type, a
property of a parameter's inline object type, and a `catch` binding. Not in a named type's field,
not in a return type, not inside `Promise<unknown>` or `Record<string, unknown>`.

This is the rule that shapes the codebase. It is why every external payload has a Zod schema beside
it: parse once, at the edge, into a named type. See "Constraint C1" in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

**Exhaustive switches.** `switch-exhaustiveness-check` with
`considerDefaultExhaustiveForUnions`, so adding a union member is a compile error at every place
that handles it.

**No floating promises**, and no promise passed where a sync callback is expected.

**`server/`, `app/api/`, `lib/` and `db/` log through the structured logger**, never `console`.

**`components/ui/**`is exempt** from most of the above. It is shadcn CLI output, regenerated by the
tool, which would revert any edit made to satisfy a rule.`components/ai-elements/\*\*` is not linted
at all for the same reason, though it is still typechecked.

### Writing the code

Match what is around you. Two things are specific to this repository and worth stating:

**Comments explain _why_, at the top of the module.** Nearly every file here opens with a block
explaining what the module is for, what was tried instead, and what broke. That is not decoration —
it is the reason a reader can tell a deliberate oddity from a mistake. If you write something that
looks wrong and is not, say why, there.

**One owner per rule.** A limit, a price, a model name or a URL is declared in one module and read
everywhere else. If you find yourself typing a number that also exists in `plan-policy.ts` or a name
that also exists in `model-registry.ts`, import it instead. The table in
[`ARCHITECTURE.md`](ARCHITECTURE.md) lists the owners.

### Next.js

This repository is on **Next.js 16**, which differs from most training data and from most tutorials.
`AGENTS.md` says it and means it: read the relevant guide in `node_modules/next/dist/docs/` before
writing routing, metadata or caching code. Two that catch people out:

- Middleware is `proxy.ts`, not `middleware.ts`.
- **A new page must render dynamically.** The CSP carries a per-request nonce with
  `'strict-dynamic'`, which makes `'self'` inert — so a statically prerendered page ships scripts
  with no nonce and none of its JavaScript runs. Call `connection()` in any page that would
  otherwise be static. [ADR-0007](docs/adr/0007-workspace-under-app-prefix.md) has the detail.

---

## Database changes

1. Edit the schema in `db/schema/`.
2. `pnpm migration:generate` — never hand-write a migration.
3. **Read the generated SQL.** Drizzle will happily generate a `DROP COLUMN`.
4. `pnpm migration:migrate`.
5. Commit the schema change and the generated SQL together.

A migration that drops or rewrites data needs explicit sign-off in the PR, naming what is lost.

---

## Submitting a change

- Branch from `main`.
- Run the five verification commands above before pushing. CI runs the same ones plus the coverage
  gate, the bundle budget, a production-dependency audit and a gitleaks scan over full history.
- A behaviour change needs a test. A bug fix needs a test that fails without the fix.
- If your change makes a decision someone will later question, add a record in
  [`docs/adr/`](docs/adr/) — see that directory's README for the format.
- If it changes what is deployed or what is still open, update `docs/pro_plan.md`. That file is the
  project's honest account of its own state; keeping it accurate is part of the work, not overhead.

### Security

Never commit a real credential. `.env` is gitignored and CI runs gitleaks over the full history, but
the scan is a backstop, not the control. If you find a vulnerability, do not open a public issue.
