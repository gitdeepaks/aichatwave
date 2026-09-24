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
 * Migrated: sidebar (52/4), chat (114/9), marketing shell and atmosphere
 * (52/5), the marketing pages (54/2), and then auth, gen-UI, admin,
 * workspace, the shared components and the app shell (360/20).
 *
 * Empty, and it stays empty: nothing is ever added. It is kept rather than
 * deleted so the test that pins it to the rule's own findings keeps running,
 * which is what makes a new literal fail two gates rather than one.
 */
/** @type {string[]} */
export const UNMIGRATED_PALETTE_FILES = [];
