# ADR-0008 — Long-term memory is opt-in

**Status:** Accepted · **Date:** 2026-09-19 · **Deciders:** owner

## Context

The assistant extracts durable personal facts from messages — "prefers TypeScript", "works on a
Next.js app", "is in Bengaluru" — embeds them, and injects the relevant ones into the system prompt
of later conversations. It is one of the product's better features.

It had never asked. Every account had it on from the first message, the Memory Center was the only
place the stored facts were visible, and nothing in the product told a user this was happening
before it had happened.

## Decision

Memory is **off until the user turns it on**, enforced on the server, with three states rather than
two.

`user.memory_consent` is a nullable enum (`granted` | `declined`). Null is _undecided_ — the state
a new account starts in — and it is distinct from `declined`. Only `granted` permits anything.

A boolean would not have worked, because it has to default to something and both defaults are
wrong: `false` hides the feature from someone who wants it, `true` turns on durable storage of
personal facts without asking. The third state is what lets the product ask exactly once and know
whether it already has.

**Enforced at the write, not in the dialog.** `server/chat/chat-service.ts` reads consent before the
memory lookup, so an ungranted account gets neither injection nor extraction, decided from one
snapshot. `extractAndStoreMemories` checks again — it runs in `waitUntil` where a second query costs
the user nothing, and a write path whose only guard is somebody else's `if` is one refactor away
from being unguarded.

**Reads and writes are gated; storage is not erased.** Declining stops extraction and stops
injection. It deliberately does not delete what is already stored: silently destroying data the
user never asked to lose is worse than leaving it listed and individually deletable, which is what
the Memory Center does.

## Consequences

**Bought.** A truthful answer to "what do you store about me", and a switch that actually controls
it rather than one that hides the UI. The onboarding dialog has a reason to exist beyond a tour.

**Cost.** Users who would have wanted memory now have to be asked, and some will dismiss the dialog
and never get the feature. The dismissal path is a local 24-hour deferral rather than a decision,
and the Memory Center carries the control permanently, so nobody is stuck — but the conversion cost
is real and it is the price of asking.

One extra `select` on the chat path per turn, against the primary key of a table already in cache.

**Watch.** Memories written _before_ this decision exist and belong to accounts that are now
`undecided`, which means they are stored, visible, deletable, and not used. That is the safe
reading, and it is deliberate. Deleting them retroactively was rejected for the same reason
declining does not delete: the data is the user's, and the answer to "we never asked" is to ask,
not to destroy.
