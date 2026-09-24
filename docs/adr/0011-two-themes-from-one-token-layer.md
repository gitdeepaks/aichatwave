# ADR-0011 — Two themes from one token layer

**Status:** Accepted · **Date:** 2026-09-24 · **Deciders:** owner · **Supersedes:**
[ADR-0005](0005-dark-theme-only.md)

## Context

ADR-0005 chose one theme, dark, and its reasoning was sound for the moment it was written: a light
theme was not a token swap, because the glass shells, the ember atmosphere and "some sixty
`white/…` and `zinc-…` literals" were written for a dark canvas, and auditing each of them for
contrast was a project rather than a polish item.

Two things changed.

**The count was wrong, and then it was zero.** Phase L2 measured 467 raw palette literals, not
sixty — and then migrated all of them, plus the message bubble's fourteen in a directory the lint
rule had never been pointed at. Every colour in `app/` and `components/` now names a role, and
`design/no-raw-palette` fails the build on the next literal. What ADR-0005 called "a project" was
the migration; it is done.

**Contrast became a test rather than an audit.** ADR-0005's real objection was that every surface
would need checking by eye. `tests/design-contrast.test.ts` now checks every foreground/background
pair the product draws — 108 of them, 216 checks across the two themes, including states an E2E run never reaches — against
WCAG AA from the stylesheet itself, in both themes, on every `pnpm test`.

Both comparators ship a light theme, and some people simply read better on one.

## Decision

**Ship light and dark from one token layer, following the operating system by default, with a
per-reader override that persists.**

- **One declaration per role.** A role that differs between themes is written once, as
  `light-dark(<light>, <dark>)`. There is no second block of declarations to drift from the first.
- **`system` is the default and renders no class.** `:root` carries `color-scheme: light dark`, so
  the browser follows the OS live, including a change made while the page is open, without script.
- **A pin is a class, rendered by the server from a cookie.** `lib/appearance.ts` owns the cookie
  names, the parsers and the defaults (C8). The root layout reads the cookie and renders
  `<html class="light">` or `"dark"`, so the first paint is already right; a cookie rather than
  `localStorage` because the server cannot read `localStorage`, and a preference applied by script
  after paint is the theme flash every toggle on the web is known for.
- **The toggle** is a radio group in the account menu and two actions in the command palette. It
  writes the cookie and sets the class in the same frame.

## Consequences

**Bought.** A light theme that is exactly as consistent as the dark one, because it is the same
roles. A new role is AA-checked in both themes before any component uses it.

**Cost: the audit moved the dark theme too.** It found pairs the dark theme had always failed, and
they were fixed rather than exempted:

| Pair                               | Was       | Now                                                   |
| ---------------------------------- | --------- | ----------------------------------------------------- |
| `fg-subtle` (placeholders, labels) | 3.5–4.2:1 | ≥ 4.5 — a new `--ink-450` step, lighter than zinc-500 |
| `fg-faint` (hints, disabled)       | 2.3–2.6:1 | ≥ 3 — `--ink-550`, held to the non-text minimum       |
| White label on the ember CTA       | 2.9:1     | Dark label on `ember-400 → crimson-500`, ≥ 5.2        |
| White label on `danger`            | 3.7:1     | `danger` moves from crimson-500 to crimson-600        |

The call to action is the most visible of these: it now reads like the send button — a lit ember
surface with a dark label — rather than white on orange.

**Cost: `light-dark()` is compiled.** Lightning CSS, under Tailwind v4, rewrites it into a
`--lightningcss-light` / `--lightningcss-dark` variable polyfill, resolved on `:root`. That is
correct for a theme pinned on `<html>`, which is the only place this product pins one. A future
"this panel is always dark" region would need its own `color-scheme` and would not get it from the
polyfill — use the theme-invariant roles (`shade`, `fg-on-fill`, `media-canvas`) for that instead.

**Watch.** `THEME_COLOR` in `lib/appearance.ts` is the one page colour written outside the
stylesheet, because `<meta name="theme-color">` cannot read a custom property; a test holds it to
`--surface-sunken`. A reader who pins the opposite of their OS gets browser chrome in the OS's
colour; fixing that would make every page's viewport metadata dynamic.
