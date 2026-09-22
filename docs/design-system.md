# The design system

The tokens live in `app/globals.css`. The reasoning behind the identity lives in
[ADR-0010](adr/0010-ember-on-zinc-applied-with-restraint.md). This file is the third thing: the
substitution table, so that migrating the remaining files is a lookup rather than a judgement, and
so that two people migrating two files land on the same answer.

Phase L2 in `next_level.md` is the work this serves.

## The rule

A component names a **role**. It never names a ramp step (`--ember-400`), never a Tailwind palette
literal (`zinc-400`, `white/10`), and never an arbitrary colour (`text-[#b4b4b4]`).
`design/no-raw-palette` fails the build on all three. `components/ui/` is exempt, because it is
shadcn output a regeneration would revert.

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

`--streaming` exists for the "a reply is arriving" state and is currently the brand. It has its own
name so the restraint rule can move it without moving the action colour.

## Scales

| Scale         | Steps                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| **Type**      | `text-2xs` (10px) then Tailwind's `xs`…`2xl`; display on `3xl`…`7xl`                                  |
| **Radius**    | `rounded-xs`…`rounded-4xl`, plus `rounded-5xl` (32px)                                                 |
| **Elevation** | `shadow-elevation-sm` … `-xl`, all black                                                              |
| **Glow**      | `shadow-glow-sm`, `-md`, `-lg`, `-ring`, `-up`, all brand                                             |
| **Hairline**  | `shadow-hairline`, `inset-shadow-hairline`, `inset-shadow-highlight`, `inset-shadow-highlight-strong` |
| **Blur**      | `blur-glass` (24px), `blur-glass-heavy` (40px)                                                        |
| **Motion**    | `duration-fast` \| `-base` \| `-slow` \| `-slower`, `ease-emphasis`                                   |

Arbitrary font sizes land on the nearest step: 9–10px → `text-2xs`, 11–12 → `text-xs`, 13–14 →
`text-sm`, 15–16 → `text-base`, 17–18 → `text-lg`, 22 → `text-2xl`. Tailwind's own values are
unchanged, so the 164 existing uses of `text-sm` and `text-xs` do not move.

## Composed utilities

Eighteen hand-rolled glass treatments and twenty hand-rolled brand gradients, each spelled once.
None of them sets a radius or a border — a glass panel is a card in one place and a full-bleed bar
in another — so pair them with `border-glass-border` and a step from the radius scale.

| Utility              | Is                                                              |
| -------------------- | --------------------------------------------------------------- |
| `glass`              | the translucent panel: fill, blur, inset top highlight          |
| `glass-strong`       | the same, one weight up — hover, or a panel over a panel        |
| `brand-action`       | the filled call-to-action, with its hover                       |
| `brand-action-vivid` | the send button: the brightest surface in the product           |
| `brand-wash`         | active state on a row — a selected thread, the current nav item |
| `brand-wash-tile`    | the same wash on a square: the brand tile, an icon chip         |
| `brand-glass`        | a glass panel with the ember warmed into it                     |
| `brand-rule`         | the divider that fades in from both ends; pair with `h-px`      |

## Checking it

| Command              | Catches                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `pnpm lint`          | a raw palette literal or arbitrary colour in a file off the ratchet   |
| `pnpm test`          | a token that does not resolve, a scale that lost a step               |
| `pnpm design:verify` | a token **name** that compiles to nothing — run it after `pnpm build` |

The third is the one the others cannot do. Ask Tailwind for a theme key that is not there —
`text-fg-mutted` — and it emits no error and no class, and the element renders unstyled. On a dark
canvas that usually reads as "about right".
