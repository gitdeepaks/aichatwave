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
 * Migrated so far: sidebar (52/4), chat (114/9), marketing shell and
 * atmosphere (52/5), the marketing pages (54/2).
 * The trailing number on each line is that file's count when the list was
 * written, so a migration commit can be checked against it.
 */
export const UNMIGRATED_PALETTE_FILES = [
  // shared components — 148 across 10 files
  "components/command-palette/command-palette.tsx", // 21
  "components/custom/message-attribution.tsx", // 1
  "components/custom/message-renderer.tsx", // 19
  "components/memory/memory-consent-card.tsx", // 20
  "components/model-selector.tsx", // 8
  "components/onboarding/onboarding-dialog.tsx", // 33
  "components/pro-upgrade-cta.tsx", // 8
  "components/profile/delete-account-card.tsx", // 12
];
