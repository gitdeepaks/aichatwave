/**
 * The files Phase L2 item 3 has not migrated yet.
 *
 * `eslint-rules/no-raw-palette.mjs` reads this list and stays silent on the
 * paths in it. That is the only reason the rule can be switched on before the
 * migration instead of after: the files already done are protected from day
 * one, and a literal cannot creep back into them.
 *
 * Every migration commit deletes the entries it finished. Nothing is ever
 * added — an entry here is a debt with a name on it, not permission, and the
 * list reaching `[]` is Phase L2's first exit criterion.
 *
 * Baseline at the token layer commit: 619 literals across 40 files.
 * Migrated so far: sidebar (52 across 4), the chat surrounds (38 across 6).
 * The trailing number on each line is that file's count when the list was
 * written, so a migration commit can be checked against it.
 */
export const UNMIGRATED_PALETTE_FILES = [
  // chat — 76 across 3 files
  "components/chat/chat-composer.tsx", // 49
  "components/chat/chat-empty-state.tsx", // 18
  "components/chat/prompt-starter-card.tsx", // 9
  // marketing — 102 across 6 files
  "app/(marketing)/layout.tsx", // 2
  "app/(marketing)/page.tsx", // 37
  "app/(marketing)/pricing/page.tsx", // 17
  "components/marketing/marketing-header.tsx", // 7
  "components/marketing/marketing-shell.tsx", // 26
  "components/marketing/plan-cards.tsx", // 13
  // auth — 30 across 1 file
  "components/auth/auth-screen-shell.tsx", // 30
  // gen-ui — 26 across 2 files
  "components/gen-ui/product-carousel.tsx", // 3
  "components/gen-ui/weather-card.tsx", // 23
  // admin — 44 across 1 file
  "app/app/admin/operations/page.tsx", // 44
  // workspace — 99 across 5 files
  "app/app/layout.tsx", // 7
  "app/app/memories/page.tsx", // 9
  "app/app/memories/records.tsx", // 16
  "app/app/profile/page.tsx", // 46
  "app/app/success/page.tsx", // 21
  // shared components — 148 across 10 files
  "components/brand/brand-atmosphere.tsx", // 4
  "components/command-palette/command-palette.tsx", // 21
  "components/custom/message-attribution.tsx", // 1
  "components/custom/message-renderer.tsx", // 19
  "components/error/error-surface.tsx", // 22
  "components/memory/memory-consent-card.tsx", // 20
  "components/model-selector.tsx", // 8
  "components/onboarding/onboarding-dialog.tsx", // 33
  "components/pro-upgrade-cta.tsx", // 8
  "components/profile/delete-account-card.tsx", // 12
  // app shell — 4 across 2 files
  "app/global-error.tsx", // 2
  "app/layout.tsx", // 2
];
