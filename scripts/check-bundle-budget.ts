import { readFile } from "node:fs/promises";
import { z } from "zod";

const routeBundleStatsSchema = z.array(
  z.object({
    route: z.string(),
    firstLoadUncompressedJsBytes: z.number().int().nonnegative(),
  }),
);

/**
 * Per-route first-load JS ceilings, in uncompressed bytes.
 *
 * Every route is named explicitly and a route Next does not report is a
 * failure, not a skip — that is what catches a page silently leaving the
 * budget behind, which is exactly what happened when Phase J moved the
 * workspace from `/` to `/app` and these keys stopped matching anything.
 *
 * ## The two public routes
 *
 * `/` and `/pricing` are the routes a stranger meets, and the only ones whose
 * first-load JS a search engine scores. They are budgeted far tighter than the
 * workspace because they do far less: no chat transport, no streaming, no
 * Radix sidebar. Keep it that way — if a marketing page starts approaching the
 * workspace's figure, something has been imported that does not belong there.
 *
 * ## Why every route carries ~77 KB it does not use
 *
 * `app/layout.tsx` passes `ui` to `<ClerkProvider>`, which bundles Clerk's
 * components rather than loading them from Clerk's CDN. That pins the `cl-*`
 * class names the `.auth-clerk` rules in `app/globals.css` depend on — see
 * `docs/adr/0009-clerk-appearance-via-css.md` — and it costs 76,726 bytes on
 * every route, measured, including the two that render no Clerk component at
 * all. A deliberate trade, taken with the number in hand. Removing the `ui`
 * prop is what reclaims it, and these budgets should drop by that amount if
 * anyone ever does.
 */
const ROUTE_BUDGETS = {
  // Public. Measured at 857,482 and 1,143,761.
  "/": 900_000,
  "/pricing": 1_190_000,

  // The workspace. Measured at 3,122,778 for both.
  "/app": 3_170_000,
  "/app/chat/[thread_id]": 3_170_000,

  // The operations dashboard is a server component through and through: its
  // first-load JS is the shell every page under `/app` carries and nothing
  // more. Budgeted so that stays true.
  "/app/admin/operations": 1_625_000,
  "/app/memories": 1_650_000,
  "/app/profile": 1_640_000,
  "/app/success": 1_630_000,

  "/sign-in/[[...sign-in]]": 880_000,
  "/sign-up/[[...sign-up]]": 880_000,
  "/_not-found": 865_000,
} satisfies Record<string, number>;

const statsPath = ".next/diagnostics/route-bundle-stats.json";

async function main(): Promise<void> {
  const stats = routeBundleStatsSchema.parse(JSON.parse(await readFile(statsPath, "utf8")));
  const measured = new Map(stats.map((entry) => [entry.route, entry.firstLoadUncompressedJsBytes]));
  let failed = false;

  for (const [route, budget] of Object.entries(ROUTE_BUDGETS)) {
    const bytes = measured.get(route);
    if (bytes === undefined) {
      console.error(`Bundle budget: Next did not report required route ${route}.`);
      failed = true;
      continue;
    }

    const delta = budget - bytes;
    const status = delta >= 0 ? "PASS" : "FAIL";
    console.log(`${status} ${route}: ${bytes.toLocaleString()} / ${budget.toLocaleString()} bytes`);
    if (delta < 0) failed = true;
  }

  if (failed) process.exitCode = 1;
}

void main();
