# Runbook

For whoever is on call. Organised by **what you are looking at**, not by what is wrong — when a page
fires you have a symptom, not a diagnosis.

Everything here is verifiable from the running system. Where a step says "check X", X is a real log
field, a real endpoint or a real script, not a suggestion to look around.

---

## Before anything: the three ids

Every request carries a **request id**, echoed to the client as `x-request-id` and printed on the
error page for the user to quote. Every chat turn carries a **turn id**. When a tracing backend is
configured, both resolve to a **trace id**, logged on `chat.stream_started`.

A user report that includes the id on the error page is resolvable by `grep`. One that does not,
start from the timestamp and the route.

```
requestId  → every log line for that request
turnId     → every log line, span and provider call for that chat turn
traceId    → the span tree: route → graph → LLM → tool
```

---

## First three checks, always

```bash
# 1. Is the instance alive and is the database reachable?
curl -s https://www.aichatwave.in/api/health | jq

# 2. Is the Polar credential alive? (costs one outbound call — do not poll this)
curl -s 'https://www.aichatwave.in/api/health?deep=1' | jq

# 3. Are the objectives being met?
#    Admin-only; sign in as an ADMIN_USER_IDS account.
open https://www.aichatwave.in/app/admin/operations
```

`/api/health` returns **503** when a dependency is down, so a platform probe pulls the instance out
of rotation rather than routing traffic at a process that cannot serve it. A 503 with
`checks.database: "failing"` is a database problem, not an app problem.

---

## Service level objectives

Defined in `lib/observability/slo.ts`, evaluated by `/api/admin/slo`, rendered on the operations
dashboard. Each carries its own first diagnostic step; they are reproduced here with what to do
next.

| SLO                           | Objective | Page at | Scope    |
| ----------------------------- | --------- | ------- | -------- |
| Chat time to first token, p95 | 4 s       | 10 s    | instance |
| Chat stream error rate        | 1 %       | 5 %     | fleet    |
| API 5xx rate                  | 0.5 %     | 2 %     | instance |
| Polar usage ingest failures   | 1 %       | 10 %    | instance |

**"Scope: instance" is not a footnote.** Two of these are counted in process memory because nothing
durable records them, so the dashboard reports what _the instance that answered_ has seen. On a
multi-instance deployment, a healthy reading is not proof the fleet is healthy. The dashboard says
so per row.

### Chat time to first token is high

The model is usually not the problem. Check `preStreamMs` and `memoryLookupMs` on
`chat.stream_started` first — the pre-stream work (plan read, quota reservation, memory lookup)
dominates this number.

- `memoryLookupMs` high → the pgvector query. Check the HNSW index exists, and whether one user has
  an unusually large memory set.
- `preStreamMs` high with normal `memoryLookupMs` → the plan read went to Polar. That should happen
  at most once per user (`user.billing_synced_at` null = cold cache). If it is happening constantly,
  the mirror is not being written — look for `billing.` errors.
- Both normal → it is the provider. See the breaker section below.

### Chat stream error rate is high

Counts `chat_stream` rows that settled `failed`. **Aborted turns are excluded** — those are users
pressing stop, and counting them would page you for a working feature.

Check provider breaker state: `llm.provider_breaker_opened` / `llm.provider_breaker_closed`.

### API 5xx rate is high

4xx responses are excluded by construction — they are the API answering correctly. Group by
`AppError.code` on `route.request_failed`:

| Code                  | Status | Almost always means                                       |
| --------------------- | ------ | --------------------------------------------------------- |
| `UPSTREAM_ERROR`      | 502    | A provider or Polar rejected a well-formed request        |
| `SERVICE_UNAVAILABLE` | 503    | A credential is dead, or a provider has no key configured |
| `INTERNAL_ERROR`      | 500    | A bug. Something threw that was not an `AppError`.        |

`INTERNAL_ERROR` is the only one of the three that is _this_ code's fault. A spike in it is a
regression; find the digest in the logs from `instrumentation.ts`.

### Polar usage ingest is failing

Usage that never reaches Polar is revenue that is never billed, so this one is quiet and expensive.

```bash
pnpm polar:doctor
```

A wrong-environment token is the usual cause — see the Polar section below.

---

## Incident: nobody can sign in

Clerk is the only way in and there is no local credential to fall back to
([ADR-0006](adr/0006-social-only-authentication.md)). So:

1. **status.clerk.com.** If Clerk is down, there is no mitigation. Post a status note and wait.
2. If Clerk is up, check `authorizedParties`. `lib/security/authorized-parties.ts` builds the list
   from `NEXT_PUBLIC_APP_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL` and `VERCEL_BRANCH_URL`.
   **Every hostname the deployment answers on must be in it**, or the check locks out the users it
   exists to protect. A partial list is worse than none.
3. If sign-in succeeds but the app immediately bounces back to sign-in, suspect the session cookie
   domain or a recent proxy change.

One user locked out, rather than all: they may have signed in with a different provider than usual.
Clerk links identities by _verified email_, so Google and GitHub accounts with different addresses
are different accounts. That is the expected behaviour, not a bug.

---

## Incident: checkout fails

This has happened. Production checkout returned `502 UPSTREAM_ERROR`; the cause was an expired
`POLAR_ACCESS_TOKEN`, and the original error handling could not distinguish "the credential is
dead" from "the request was malformed". It now can.

```bash
pnpm polar:doctor
```

**Read the error code, not just the status:**

- `SERVICE_UNAVAILABLE` + `credentialFailure: true` in `billing.checkout_failed` → **the token is
  revoked, expired, or from the other Polar environment.** No amount of user retrying fixes it.
  Issue a new token in the dashboard matching `POLAR_SERVER` and redeploy.
- `UPSTREAM_ERROR` → Polar understood the request and rejected it. Check `upstreamStatus` and
  `upstreamDetail` on the same log line; an archived or wrong-environment `POLAR_PRODUCT_ID` is the
  common cause.

**Sandbox and production are separate systems.** Separate dashboards, separate tokens, separate
product ids. A token from one returns `401 invalid_token` against the other. Switching environments
is a **three-value change** — `POLAR_SERVER`, `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_ID` — never one.

This deployment runs `POLAR_SERVER=sandbox` deliberately. Sandbox takes test cards only and moves no
real money. See [ADR-0003](adr/0003-polar-over-stripe.md).

### A customer paid and is still on Free

The local `subscription` mirror is behind. Either the Polar webhook is not configured
(`POLAR_WEBHOOK_SECRET` unset → `/api/webhooks/polar` returns 503) or a delivery failed.

The mirror self-heals on a cold read, so the user regains Pro within `BILLING_CACHE_TTL_MS`. To fix
it now: set the webhook secret, or have the user reload `/app/profile`, which forces a plan read.

---

## Incident: one provider is failing

The app already handles this. `server/ai/provider-health.ts` runs a per-provider circuit breaker,
and `fallbackModelId` moves the turn to a **different** provider that is configured, healthy, and
**at the same tier or lower**.

That last constraint is deliberate and has a visible consequence: **during an OpenAI outage, a
free-tier user has no fallback**, because both free models are OpenAI's. Failing the turn is the
correct outcome — the alternative is handing out Claude for free. Expect chat errors from free users
and none from Pro users, and do not "fix" it by loosening the tier rule.

What to check:

- `llm.provider_breaker_opened` — which provider, and when.
- The provider's own status page.
- `configuredProviders` — a provider with no API key is _unavailable_, which is a 503 an operator
  owns, not a 403 a user can fix by upgrading.

---

## Incident: nothing is streaming, or streams hang

1. **Stream leases.** One user pinned at their concurrency limit cannot start a turn.
   `stream_lease` rows are released when the response settles; `expires_at` is the backstop for a
   process that died mid-stream (`STREAM_LEASE_TTL_MS`, 5 minutes). A free user has exactly one
   slot, so a stuck lease locks them out completely until it expires.

   ```sql
   select owner_key, slot, acquired_at, expires_at
   from stream_lease
   where expires_at > now()
   order by acquired_at;
   ```

2. **Turn duration.** `MAX_TURN_DURATION_MS` is deliberately just inside the lease TTL, so a stalled
   provider call ends while its lease is still held. A turn running longer than that is a bug.

3. **The CSP.** If a page renders but _nothing_ on it works — no streaming, no sign-in widget, no
   toasts — suspect a script blocked by CSP. `script-src` carries a per-request nonce with
   `'strict-dynamic'`, which makes `'self'` inert: a **statically prerendered page ships scripts
   with no nonce and none of its JavaScript runs.** Check the browser console for CSP violations,
   and check whether the route in question calls `connection()`. See
   [ADR-0007](adr/0007-workspace-under-app-prefix.md).

   To stage a CSP change safely, set `CSP_REPORT_ONLY=true` and watch for violations before
   enforcing.

---

## Incident: spend spike

The operations dashboard shows cost by day, by model and by user, plus a per-user anomaly flag
(today's spend against the trailing median).

1. Is it one user or all of them? `topUsers` on the cost report answers it.
2. One user → check their request rate against `PLAN_LIMITS[plan].requestsPerMinute`. The per-IP
   ceiling (`IP_REQUESTS_PER_MINUTE`) is the backstop for many accounts on one machine.
3. All users → check whether traffic actually rose, or whether a model changed. Cost is computed
   from `lib/ai/model-registry.ts` list prices; if a provider raised a price and the registry was
   not updated, the _reported_ number is wrong, not the spend.

Note that `costUsd` is `null` for a model no longer in the registry. That is not a bug — historical
rows keep their `model_id` as plain text precisely so a retired model's spend stays readable, and
the dashboard says `priced: false` rather than quoting a price it does not have.

---

## Operations you may need to perform

### Rotate the Polar token

Issue a new one in the dashboard **for the environment `POLAR_SERVER` names**, set
`POLAR_ACCESS_TOKEN`, redeploy, then confirm:

```bash
pnpm polar:doctor
curl -s 'https://www.aichatwave.in/api/health?deep=1' | jq '.checks.billing'
```

### Delete a user's data

`POST /api/account/delete` is the user-facing path and is the one to prefer — it is the tested path,
it refuses while a stream lease is held, and it writes an `account_deletion` marker that blocks
re-provisioning.

That marker is deliberately independent of the `user` cascade: it survives the row it describes, and
its presence blocks identity reprovisioning and new user-owned writes even after both the local and
Clerk identity rows are gone.

### Apply a migration

```bash
pnpm migration:migrate     # drizzle migrations + LangGraph checkpoint/store setup
```

Both halves matter. The second creates the checkpoint tables and the pgvector store, and nothing
fails until the first chat message if it is skipped.

Migrations are forward-only. There is no down migration; recovery from a bad migration is a new
migration.

---

## What is known-broken

Kept here so nobody spends an hour rediscovering it. The authoritative list is in
`docs/pro_plan.md`.

- **Stopping a stream loses the turn.** The thread row is created and no messages are written, so
  the question and the generated text are both lost — while the `HumanMessage` stays in the
  LangGraph checkpoint, so the _next_ turn sees a question the transcript does not show. Open.
- **`CLERK_WEBHOOK_SIGNING_SECRET` is unset in production**, so `/api/webhooks/clerk` returns 503.
  User rows still appear via just-in-time provisioning, but **Polar customer creation rides on
  `user.created`** and therefore never runs.
- **`NEXT_PUBLIC_APP_URL` is unset in production.** `appUrl()` falls back to the deployment-specific
  `$VERCEL_URL`, which feeds the Polar `successUrl`, the OG and canonical URLs, the sitemap and the
  cross-origin check. This is the single configuration change with the widest blast radius.
- **Clerk is on test keys** (`pk_test_` / `sk_test_`) against a production domain.
- **The database is a Neon development branch.**
- **No E2E suite.** Phase I item 5, deferred.
