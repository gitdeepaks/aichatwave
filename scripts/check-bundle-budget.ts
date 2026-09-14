import { readFile } from "node:fs/promises";
import { z } from "zod";

const routeBundleStatsSchema = z.array(
  z.object({
    route: z.string(),
    firstLoadUncompressedJsBytes: z.number().int().nonnegative(),
  }),
);

const ROUTE_BUDGETS = {
  "/": 3_085_000,
  "/chat/[thread_id]": 3_085_000,
  "/memories": 1_540_000,
  "/profile": 1_530_000,
  "/success": 1_525_000,
  "/sign-in/[[...sign-in]]": 800_000,
  "/sign-up/[[...sign-up]]": 800_000,
  "/_not-found": 785_000,
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
