# ADR-0010 — Ember on zinc, applied with restraint

**Status:** Accepted · **Date:** 2026-09-22 · **Deciders:** owner

## Context

Phase L2 counted the product's visual decisions and found 467 raw palette literals across 43 files,
against 279 uses of the semantic tokens `app/globals.css` already declared. The tokens were not
wrong; they were outvoted.

Two of those 467 numbers mattered more than the rest.

The first is the brand. Ember-orange appeared 117 times as `orange-…` and
`rgb(251 146 60 / …)` — in the send button, the focus ring, the selection colour, the scrollbar
thumb, the skip link and the sidebar. Meanwhile `--primary` held `oklch(0.922 0 0)`, a light grey:
the stock shadcn dark value, inherited on the day the theme was scaffolded and never revisited. The
single most-used colour in the product could not be changed in one place, and the token that means
"the primary action colour" pointed at a colour no primary action used.

The second is where that brand is allowed to appear. Scrollbar thumb, text selection, focus ring,
skip link, send button, sidebar primary and a dozen glow shadows all carried it. An accent applied
to everything marks nothing.

So the question was not only "which colour" but "what is it for", and neither was written down
anywhere. Phase L2 could not migrate 467 literals into tokens without first deciding what the
tokens mean.

## Decision

**Keep ember-on-zinc as the identity, and reserve it for three things: the primary action, the
focus ring, and active state.** Everything else — chrome, furniture, hairlines, the surfaces the
product is mostly made of — is neutral.

**Why keep it.** It is genuinely distinctive next to ChatGPT's black-and-green and t3.chat's
pink-purple, and the alternative on the table was another blue assistant. Throwing away a
recognisable palette to become less recognisable is a downgrade, and the problem measured above was
never the hue.

**The ramp.** `--ember-50` … `--ember-950` in `app/globals.css`, eleven steps, Tailwind v4's own
`orange` values copied verbatim. Verbatim because the migration that follows has to be a
substitution that moves no pixel, and it can only be that if `--brand-text` and `orange-300` are
the same colour to the last digit. The ramp is the only place an ember number is written; a
contract test in `tests/design-tokens.test.ts` fails if a second one appears.

**The roles.** No component reads the ramp. What a component may name is a role — `--brand`,
`--brand-strong`, `--brand-text`, `--brand-surface`, and the neutral, surface, glass, hairline and
state roles beside them — each one a `var()` into a ramp step.

**Where the brand goes.**

| Surface                                    | Before              | After                  |
| ------------------------------------------ | ------------------- | ---------------------- |
| Primary action (send, primary buttons)     | ember, as a literal | ember, via `--primary` |
| Focus ring                                 | ember, as a literal | ember, via `--ring`    |
| Active state (selected thread, active nav) | ember, as a literal | ember, via `--brand`   |
| Text selection                             | ember               | ember                  |
| Scrollbar thumb                            | ember               | **neutral**            |

Text selection stays because it is not furniture: it is the mark the reader just made, which is
active state under the rule above. The scrollbar thumb is the opposite — chrome that is on screen
for the entire session, and the clearest case of an accent that cannot also be the thing that says
"this is the action".

## Consequences

**Bought.** `--brand` is one line, and changing it restyles the product. `--primary` now means what
its name says, so every shadcn component that reads it — button, badge, switch, slider — is on the
brand without a per-component override. The rule about where the accent goes is written down, so
the next surface does not re-decide it, and the surfaces in Phases M through P inherit a decision
instead of adding to a count.

**Cost.** Repointing `--primary` from grey to ember changed every `bg-primary` and `text-primary`
in the app at once — 21 uses, most of them inside `components/ui/`. That is a deliberate,
reviewable visual change, and it is the only one in this step: it is not part of the literal
migration that follows, where nothing may move. `--ring` and `--sidebar-primary` moved with it, for
the same reason.

**Cost.** Eleven ramp steps are declared and six are currently referenced. The unreferenced ones
are there so that the migration has a step to land on rather than inventing one, and so the light
theme has a darker half of the ramp to draw from.

**Watch.** The restraint rule is a convention, not a constraint — the lint rule in Phase L2 item 4
can tell a raw literal from a token, but it cannot tell a justified `bg-brand` from a gratuitous
one. If the accent creeps back onto the furniture it will do so one component at a time, and the
place it will show first is the glow shadows.

**Supersedes nothing.** ADR-0005 (one theme, dark) still stands at the time of writing; Phase L2
item 6 is where it is revisited, and the literal count that ADR-0005 estimated at "some sixty" is
the reason it will be.
