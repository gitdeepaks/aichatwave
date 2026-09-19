# ADR-0005 — One theme, dark

**Status:** Accepted · **Date:** 2026-09-19 · **Deciders:** owner

## Context

The code contradicted itself. `app/layout.tsx` hardcoded `className="dark"` on `<html>`, so the
dark palette was always active; alongside it sat a `ThemeProvider` whose only remaining body was
`<div className="contents">{children}</div>` — a pass-through that had once wrapped `next-themes`
with `enableSystem` and now wrapped nothing. `app/globals.css` still carried a full light palette
under `:root` that no code path could ever reach.

So there were three statements about theming and no agreement between them: a provider that implied
the system preference was honoured, a class that guaranteed it was not, and a light palette that
existed but was unreachable.

Phase J required resolving it in one direction or the other: ship a real light theme, tokenized and
audited for contrast in both modes, or commit to dark and make the code say so.

## Decision

**One theme, dark.** There is no light mode and the code no longer pretends otherwise.

What that meant concretely:

- `app/globals.css` declares the tokens once, under `:root, .dark`, so there is no second palette
  to drift out of step. `<html>` keeps `class="dark"` because Tailwind's `dark:` variant resolves
  through `@custom-variant dark (&:is(.dark *))`.
- `:root` sets `color-scheme: dark`, which the app had never declared. It is what makes the
  _browser's_ own surfaces dark — scrollbars, native form controls, the overscroll canvas. Without
  it, scrolling past the end of a thread flashed white.
- `viewport.themeColor` paints the mobile browser chrome to match.
- `components/theme/theme-provider.tsx` is deleted.

## Why not ship a light theme

Because "light theme" here is not a token swap. The product's visual language — glass panels over a
deep zinc radial, ember-orange bloom, hairline rules at `white/10` — is written directly into the
components as literals: roughly sixty `white/[0.0x]`, `zinc-950/55` and `bg-gradient-to-br
from-orange-300/20` values across the sidebar, the composer, the chat shells and the auth screens.
None of them read from a token. A light mode means auditing every one for contrast and redesigning
the surfaces they compose, which is a project, not a polish item.

Shipping a half-light theme would have been worse than none: light tokens under dark literals is
grey text on a grey card.

## Consequences

**Bought.** One palette to maintain, one set of contrast ratios to verify, and no `prefers-color-scheme`
branch in any component. The browser's own chrome now matches the app.

**Cost.** Users who want light do not get it, including those who want it for a genuine reason
rather than a preference.

**Watch.** The reversal path, so it stays open: split `:root, .dark` back into `:root` (light) and
`.dark`, set `color-scheme: light dark`, reintroduce a provider that writes the class, and audit
the literals named above. The literals are the work; the tokens are an afternoon.
