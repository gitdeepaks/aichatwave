# ADR-0009 — Clerk widgets are styled with scoped CSS

**Status:** Accepted · **Date:** 2026-09-19 · **Deciders:** owner

## Context

The sign-in and sign-up screens are Clerk widgets inside this app's own shell
([ADR-0001](0001-clerk-over-better-auth.md)). Making them look like part of the product means
restyling somebody else's DOM.

Clerk's documented mechanism for that is `appearance.elements` on `<ClerkProvider>`: a map from
stable element names to class names. It is the right mechanism, and when this was built,
`@clerk/ui` v1 **did not apply it** — the prop typechecked and the class names never reached the
DOM. The widget rendered at its intrinsic 329px, sitting left of centre inside a 440px panel, with
its own card chrome drawn inside the shell's card.

Phase J carried this as an open item: revisit if a `@clerk/ui` v2 applies `appearance.elements`, or
accept the CSS approach as final.

## Decision

Accept it, and **pin the DOM it targets**.

Element-level styling stays in `app/globals.css`, scoped under `.auth-clerk`.

`@clerk/ui` has no v2 — the latest published version is 1.33.1, and the 1.34 line is canary. There
is no upgrade to revisit, so the item is closed on that basis rather than on a new test of v1.

The pin is the part that was not in the original plan. Running the app under a browser during this
phase surfaced a Clerk runtime warning that was not there when this approach was chosen:

```
Clerk: Structural CSS detected that may break on updates.
  Found: CSS ".auth-clerk .cl-rootBox", ".auth-clerk .cl-cardBox", … (+28 more)
  To prevent breaking changes, install @clerk/ui and pass it to ClerkProvider:
    <ClerkProvider ui={ui}>
  (code=structural_css_pin_clerk_ui)
```

Clerk is naming this ADR's one real cost and shipping the mitigation for it. `@clerk/ui` was
already a dependency, so `<ClerkProvider ui={ui}>` in `app/layout.tsx` is the whole change. With it,
the components rendered are the bundled ones from the `@clerk/ui` version in `package.json` rather
than whatever Clerk has deployed today — so the `cl-*` selectors move only on a deliberate
dependency upgrade.

Verified in a browser: the auth screen renders identically and the warning is gone.

**It is not free.** Bundling Clerk's components instead of loading them from Clerk's CDN adds
**76,726 bytes of uncompressed first-load JS to every route** (83,060 to the workspace), measured by
building with and without the prop. That is paid on `/` and `/pricing` too, which render no Clerk
component at all, because the provider is in the root layout and there is only one of it.

Taken deliberately, with the number in hand (owner, 2026-09-19). The budgets in
`scripts/check-bundle-budget.ts` carry the figure so removing the prop is a visible reclaim rather
than an archaeology exercise.

The rules target Clerk's documented, stable `cl-*` class names and never the hashed
`cl-internal-*` ones. Scoping to `.auth-clerk` means only the sign-in and sign-up panel is
affected; `<UserButton />` and the account portal keep their defaults.

The governing rule inside that scope: every horizontal edge lands on `--auth-gutter`, which the
shell owns. Clerk ships its own insets — a 329px intrinsic card width, `padding: 16px 32px` on each
footer row — and those are what made the panel read as three stacks that never lined up. They are
zeroed so the shell's rail is the only one.

## Consequences

**Bought.** A sign-in screen that looks like the product. The rules are ordinary CSS, so they are
inspectable in devtools and debuggable by anyone.

**Cost.** Dependence on class names this app does not own. A Clerk release that renames a `cl-*`
class breaks the styling silently — nothing fails to compile and no test catches it; it just looks
wrong.

The pin moves that risk rather than removing it: the break now happens when `@clerk/ui` is upgraded,
which is a deliberate act in a pull request, instead of on a Tuesday when Clerk deploys. That is the
whole of the improvement, and it is a large one — it converts a silent production regression into
a reviewable diff.

And it is bought with 77 KB on every page load, as above. Worth stating plainly, because the thing
being protected is _cosmetic_: an unpinned break leaves the auth screen working and looking wrong,
not broken. The judgement was that a branded sign-in screen quietly reverting to a stranger's
default styling is the worse of the two, and that it would not be noticed for weeks.

One thing is genuinely unavailable this way: `layout.socialButtonsVariant`, which would force all
three providers to labelled block buttons, is **not on the `Appearance` type in `@clerk/ui` v1** and
does not typecheck. Clerk's own arrangement is kept instead — the last-used provider gets a
labelled full-width button and the others sit beside it as marks. It could be forced with CSS
generated content, but that hardcodes provider names in a stylesheet and was not worth the trade.

**Watch.** Two things.

Check the auth screen in a browser after any `@clerk/ui` upgrade. That is now the moment the
selectors can break, and it is the only moment.

When `@clerk/ui` v2 does ship, re-test `appearance.elements` against a running app and, if it works,
supersede this record. The `.auth-clerk` block is self-contained and deleting it is the whole
migration.
