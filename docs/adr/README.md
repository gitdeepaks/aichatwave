# Architecture decision records

One file per decision that constrains the code and is **not visible from it**. A record earns its
place here when a competent reader of the codebase would otherwise ask "why on earth is it done
this way?" and find no answer in the source.

Records are immutable once merged. A decision that turns out wrong gets a **new** record that
supersedes the old one, and the old one is marked `Superseded by ADR-000N` rather than edited —
the point of the log is that it shows what was believed at the time.

`docs/pro_plan.md` remains the phase-by-phase account of the work and holds the operational state
(what is deployed, what is still open). These records hold only the durable _why_.

| #                                                    | Decision                                       | Status   |
| ---------------------------------------------------- | ---------------------------------------------- | -------- |
| [0001](0001-clerk-over-better-auth.md)               | Clerk over Better Auth                         | Accepted |
| [0002](0002-langgraph-over-raw-ai-sdk.md)            | LangGraph over the raw AI SDK agent loop       | Accepted |
| [0003](0003-polar-over-stripe.md)                    | Polar over Stripe                              | Accepted |
| [0004](0004-owned-message-table.md)                  | An owned `message` table beside the checkpoint | Accepted |
| [0005](0005-dark-theme-only.md)                      | One theme, dark                                | Accepted |
| [0006](0006-social-only-authentication.md)           | Social-only authentication                     | Accepted |
| [0007](0007-workspace-under-app-prefix.md)           | The workspace lives under `/app`               | Accepted |
| [0008](0008-opt-in-long-term-memory.md)              | Long-term memory is opt-in                     | Accepted |
| [0009](0009-clerk-appearance-via-css.md)             | Clerk widgets are styled with scoped CSS       | Accepted |
| [0010](0010-ember-on-zinc-applied-with-restraint.md) | Ember on zinc, applied with restraint          | Accepted |

## Format

Each record is: **Context** (the forces, including what was tried), **Decision** (one sentence,
then the shape of it), **Consequences** (what this buys, what it costs, what to watch). Numbers are
allocated on merge and never reused.
