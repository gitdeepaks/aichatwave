# The design system

The tokens live in `app/globals.css`. The reasoning behind the identity lives in
[ADR-0010](adr/0010-ember-on-zinc-applied-with-restraint.md). This file is the third thing: the
substitution table, so that migrating the remaining files is a lookup rather than a judgement, and
so that two people migrating two files land on the same answer.

Phase L2 in `next_level.md` is the work this serves.

## Two themes

Every role below has a light and a dark value, written once as `light-dark(<light>, <dark>)` in
`app/globals.css`. A component never asks which theme it is in: `text-fg-muted` is the right muted
text in both. The theme is the reader's (`System`, `Light` or `Dark`, in the account menu and the
command palette); see [ADR-0011](adr/0011-two-themes-from-one-token-layer.md) for how it is applied.

Where the tables below say "was `zinc-400`", that is the dark value — the migration's reference
point. In light the same role reads from the other end of the ramp.

**Three roles do not follow the theme**, because what they sit on does not:

| Role           | Is                                                                  |
| -------------- | ------------------------------------------------------------------- |
| `shade`        | black: a scrim over media, the colour of a cast shadow              |
| `fg-on-fill`   | white: text on a scrim or on media, which stays dark in both themes |
| `media-canvas` | white: the lightbox a product photo is shot against                 |

Use them only for those. `text-fg-on-fill` on a themed surface is white text on a white page in
light mode.

## The rule

A component names a **role**. It never names a ramp step (`--ember-400`), never a Tailwind palette
literal (`zinc-400`, `white/10`), and never an arbitrary colour (`text-[#b4b4b4]`).
`design/no-raw-palette` fails the build on all three, including in `components/ui/`: shadcn output
is still code the theme has to reach, and a hand-edited dark sidebar there was the first thing the
light theme exposed. `design/no-arbitrary-scale` does exempt `components/ui/`, whose motion and
radius steps are shadcn's own.

Two layers, and only the first is raw:

| Layer     | Where                                | Who may read it |
| --------- | ------------------------------------ | --------------- |
| **Ramps** | `--ember-*`, `--ink-*`, status ramps | the token layer |
| **Roles** | `--brand`, `--fg-muted`, `--surface` | everything      |

## Colour

### Text

| Was          | Now                 | Use                                       |
| ------------ | ------------------- | ----------------------------------------- |
| `white`      | `fg-bright`         | the brightest text: active rows, headings |
| `zinc-50`    | `fg-bright`         | —                                         |
| `zinc-100`   | `fg-strong`         | primary text on a panel                   |
| `zinc-200`   | `fg`                | body                                      |
| `zinc-300`   | `fg-soft`           | secondary body, nav items at rest         |
| `zinc-400`   | `fg-muted`          | metadata, labels                          |
| `zinc-500`   | `fg-subtle`         | placeholders, disabled, group labels      |
| `zinc-600`   | `fg-faint`          | the faintest legible text: keyboard hints |
| `orange-100` | `brand-text-bright` | brand text at its brightest               |
| `orange-200` | `brand-text-strong` | emphasised brand text, hover              |
| `orange-300` | `brand-text`        | brand text at rest: active icons, links   |

`text-white` becoming `text-fg-bright` moves `#ffffff` to `#fafafa`. That is deliberate: the app's
own `--foreground` has always been `#fafafa`, and `text-white` was a third spelling of it that
agreed with neither the token nor `text-zinc-50`.

### Surfaces

| Was                  | Now               | Use                                       |
| -------------------- | ----------------- | ----------------------------------------- |
| `zinc-950`           | `surface-sunken`  | the well a composer or code block sits in |
| — (`--background`)   | `surface`         | the page                                  |
| `zinc-900`           | `surface-raised`  | a panel                                   |
| `zinc-900` (dialogs) | `surface-overlay` | dialogs, popovers, sheets                 |
| `orange-950`         | `brand-surface`   | a tinted brand surface                    |

Alpha is kept: `bg-zinc-900/80` becomes `bg-surface-raised/80`.

### Glass and hairlines

Translucent white, allocated to the nearest step. The largest move is 1.5 percentage points of
white over a near-black ground — under two levels per channel.

| Was                                                     | Now            |
| ------------------------------------------------------- | -------------- |
| `white/[0.03]` … `white/[0.06]`, `white/5`              | `glass`        |
| `white/[0.065]` … `white/[0.11]`, `white/8`, `white/10` | `glass-strong` |
| `white/[0.115]` … `white/[0.17]`, `white/15`            | `glass-heavy`  |
| `white/20` and above                                    | `glass-solid`  |

As a **border** rather than a fill, the same values become hairlines:

| Was                                      | Now                      |
| ---------------------------------------- | ------------------------ |
| `border-white/5` … `border-white/[0.07]` | `border-hairline-subtle` |
| `border-white/8` … `border-white/12`     | `border-hairline`        |
| `border-white/15` and above              | `border-hairline-strong` |

### State

| Was                    | Now                                           |
| ---------------------- | --------------------------------------------- |
| `red-400`              | `destructive` (shadcn's own role, same value) |
| `red-500` / `red-600`  | `danger` / `danger-strong`                    |
| `red-300` / `red-950`  | `danger-text` / `danger-surface`              |
| `emerald-400` / `-500` | `success` / `success-strong`                  |
| `emerald-200` / `-950` | `success-text` / `success-surface`            |
| `amber-400` / `-500`   | `warning` / `warning-strong`                  |
| `amber-200` / `-950`   | `warning-text` / `warning-surface`            |

`rating` is the filled star on a product card — not `warning`, because five stars is not a
caution.

`--streaming` is the "a reply is arriving" state — the upload indicator, the composer spinner. A
step lighter than the action colour, because it reports rather than invites.

### Atmosphere

The washes that light a page are colours, not gradients: the ellipse geometry differs per surface
and only the colour is shared. Written inside an arbitrary background value, as
`bg-[radial-gradient(ellipse_80%_45%_at_50%_-8%,var(--bloom-ember),transparent_60%)]`.

| Token                | Is                                                                           |
| -------------------- | ---------------------------------------------------------------------------- |
| `--bloom-ember`      | the ember wash from above the fold                                           |
| `--bloom-ember-soft` | the same at card scale — a page-sized bloom on a 400px card reads as a stain |
| `--bloom-crimson`    | the deep wash from the right                                                 |
| `--bloom-amber`      | the warm wash from the lower left                                            |
| `--vignette`         | the edge darkening under both atmospheres                                    |
| `--vignette-deep`    | the auth screen's heavier edge                                               |

`atmosphere-ground` is the surface all of it is lit on: an ember-tinted core falling to the page.

A colour nested inside an arbitrary value is still a literal, and
`design/no-raw-palette` reads inside the brackets — including the
arbitrary-property form, `[background-image:…]`, which carries no utility prefix. The 64px
technical grid and the whole ember atmosphere hid there until it learned to.

## Scales

| Scale         | Steps                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| **Type**      | `text-2xs` (10px) then Tailwind's `xs`…`2xl`; display on `3xl`…`7xl`                                  |
| **Radius**    | `rounded-xs`…`rounded-4xl`, plus `rounded-5xl` (32px)                                                 |
| **Elevation** | `shadow-elevation-sm` … `-xl`, all black                                                              |
| **Glow**      | `shadow-glow-sm`, `-md`, `-lg`, `-ring`, `-up`, all brand                                             |
| **Hairline**  | `shadow-hairline`, `inset-shadow-hairline`, `inset-shadow-highlight`, `inset-shadow-highlight-strong` |
| **Blur**      | `blur-glass-light` (12px), `blur-glass` (24px), `blur-glass-heavy` (40px)                             |
| **Motion**    | `duration-fast` \| `-base` \| `-slow` \| `-slower`, `ease-emphasis` (and `ease-linear` for spinners)  |
| **Density**   | `gap-transcript`, `pt-transcript`, `px-bubble-x`, `py-bubble-y`, `h-row` — see below                  |

Arbitrary font sizes land on the nearest step: 9–10px → `text-2xs`, 11–12 → `text-xs`, 13–14 →
`text-sm`, 15–16 → `text-base`, 17–18 → `text-lg`, 22 → `text-2xl`. Tailwind's own values are
unchanged, so the 164 existing uses of `text-sm` and `text-xs` do not move.

`design/no-arbitrary-scale` rejects anything off these scales: `text-[15px]`, any `rounded-[…]` or
`shadow-[…]`, Tailwind's stock `blur-md`…`blur-3xl`, numeric durations and every easing but
`ease-emphasis` and `ease-linear`. Layout values — `w-[…]`, `max-w-[38ch]`, `tracking-[…]` — are
not scales and are not checked.

### Density

Comfortable (the default) and compact switch four spacing tokens and nothing else, via
`data-density="compact"` on `<html>`. No type size, radius or colour moves, which is what makes the
switch unable to clip text; `tests/appearance.test.ts` holds the tokens to lengths only.

| Utility                           | Comfortable | Compact  | Where                               |
| --------------------------------- | ----------- | -------- | ----------------------------------- |
| `gap-transcript`, `pt-transcript` | 1.5rem      | 0.75rem  | between messages, above the first   |
| `px-bubble-x`                     | 1rem        | 0.75rem  | a message bubble's sides            |
| `py-bubble-y`                     | 0.75rem     | 0.5rem   | a message bubble's top and bottom   |
| `h-row`                           | 2.25rem     | 1.875rem | a sidebar row: a thread, a nav item |

A new surface that should tighten under compact uses these; one that should not uses the ordinary
spacing scale.

### Charts

`--chart-1` … `--chart-5` (`bg-chart-1`, `stroke-chart-2`, …). Series one is the brand. Each series
clears 3:1 against the page in both themes, and every pair stays at least 0.1 apart in OKLab for
typical vision and for protanopia, deuteranopia and tritanopia (`tests/design-charts.test.ts`). The
series step in lightness as well as hue, because hue alone does not survive a dichromacy. Use them
in order; a sixth series is a legend problem, not a palette one.

## Composed utilities

Eighteen hand-rolled glass treatments and twenty hand-rolled brand gradients, each spelled once.
None of them sets a radius or a border — a glass panel is a card in one place and a full-bleed bar
in another — so pair them with `border-glass-border` and a step from the radius scale.

| Utility                                                 | Is                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `glass`                                                 | the translucent panel: fill, blur, inset top highlight                         |
| `glass-strong`                                          | the same, one weight up — hover, or a panel over a panel                       |
| `brand-action`                                          | the filled call-to-action, with its hover; label with `text-action-foreground` |
| `brand-action-vivid`                                    | the send button: the brightest surface in the product                          |
| `brand-wash`                                            | active state on a row — a selected thread, the current nav item                |
| `brand-wash-tile`                                       | the same wash on a square: the brand tile, an icon chip                        |
| `brand-glass`                                           | a tinted fill, ember warmed into glass; add your own blur                      |
| `brand-rule`                                            | the divider that fades in from both ends; pair with `h-px`                     |
| `hairline-rule`                                         | the same divider without the ember: structure, not emphasis                    |
| `brand-headline`                                        | the display gradient clipped to the text, `color: transparent` and all         |
| `brand-bubble`                                          | the user's own message: ember warmed into glass                                |
| `atmosphere-ground`                                     | the ground the blooms, grid and vignette are layered on                        |
| `weather-sky-day`, `weather-sky-night`, `weather-panel` | the weather card's picture of the sky                                          |

## Checking it

| Command              | Catches                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`          | a raw palette literal, an arbitrary colour, or a value off a scale                                                                                |
| `pnpm test`          | a token that does not resolve, a scale that lost a step, a token pair below WCAG AA in either theme, a chart series two readers cannot tell apart |
| `pnpm design:verify` | a token **name** that compiles to nothing — run it after `pnpm build`                                                                             |

The third is the one the others cannot do. Ask Tailwind for a theme key that is not there —
`text-fg-mutted` — and it emits no error and no class, and the element renders unstyled. On a dark
canvas that usually reads as "about right".

Run it after a **clean** build. A Turbopack build over an existing `.next` has been seen to ship a
stale stylesheet, and `design:verify` then checks today's source against yesterday's CSS.

### Contrast

`tests/design-contrast.test.ts` lists every foreground/background pair the product draws — text on
each surface and on glass, brand text, the action's label on each gradient stop, the focus ring,
shadcn's pairs, and each state's text on its own tinted pill — and holds each to WCAG AA in both
themes: 4.5:1 for text, 3:1 for non-text UI. `fg-faint` is incidental text (hints, disabled rows)
and is held to 3:1. A new role that a component will put text on belongs in that list.
