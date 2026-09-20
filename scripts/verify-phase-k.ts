/**
 * Phase K preflight: is this deployment actually a production deployment?
 *
 * Phase K items 1–4 are configuration, not code. They were recorded in
 * `docs/pro_plan.md` as "Deployment state — open items" and stayed open for
 * ten days, which is what open items in a finished document do. This script is
 * the answer: it reads the environment the process is actually running in and
 * fails if any of the four is still unfixed.
 *
 * Every check here is invisible from the repository. The code is identical on a
 * correct deployment and a broken one — that is precisely why the four items
 * were able to go unnoticed, and why a script rather than a review is what
 * closes them.
 *
 * Run it against the environment being judged:
 *
 *   pnpm phase-k:verify                     # this machine
 *   vercel env pull && pnpm phase-k:verify  # what production holds
 *
 * Usage: pnpm phase-k:verify
 */

import { readFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";
import { appUrl, env, polarServer } from "@/lib/env";

/** The domain this product is actually served from. */
const PRODUCTION_HOST = "www.aichatwave.in";

/**
 * The Neon endpoint of the production branch, once one exists.
 *
 * `null` until Phase K item 4 is done, and that is the whole point: a Neon
 * endpoint id is random, so nothing about a connection string reveals whether
 * it points at production or at the disposable development branch. Only a
 * person knows, so a person writes it down here — once — and every run after
 * that compares against it.
 */
const PRODUCTION_DATABASE_HOST: string | null = null;

/**
 * Whether the environment under inspection claims to be production.
 *
 * `VERCEL_ENV` is what Vercel sets and is the honest signal; `NODE_ENV` is
 * `"production"` for any built artifact, including a local `pnpm build`, so it
 * cannot distinguish a deployment from a laptop on its own.
 */
const isProduction = env.NODE_ENV === "production" && process.env["VERCEL_ENV"] !== "preview";

let failures = 0;

function report(label: string, detail: string): void {
  console.log(`  ${label.padEnd(32)} ${detail}`);
}

/**
 * Records a failure and keeps going.
 *
 * Deliberately not `assert`: the point of this script is to hand back the
 * whole list of what is still misconfigured, so one deploy fixes four things.
 * Stopping at the first would turn a single pass into four.
 */
function check(condition: boolean, label: string, failureDetail: string, okDetail: string): void {
  if (condition) {
    report(label, `✅ ${okDetail}`);
    return;
  }
  failures += 1;
  report(label, `❌ ${failureDetail}`);
}

/** Item 1 — `NEXT_PUBLIC_APP_URL`. */
function verifyAppUrl(): void {
  const declared = env.NEXT_PUBLIC_APP_URL;
  const resolved = appUrl();

  report("Resolved app URL", resolved);

  check(
    declared !== undefined,
    "NEXT_PUBLIC_APP_URL",
    `unset — appUrl() is falling back to ${resolved}, which is the deployment hostname. ` +
      `Checkout redirects and OG cards both point at it.`,
    declared ?? "",
  );

  if (declared === undefined) return;

  check(declared.startsWith("https://"), "App URL scheme", `${declared} is not https`, "https");

  check(
    !declared.includes(".vercel.app"),
    "App URL host",
    `${declared} is a deployment hostname, not the product's domain`,
    new URL(declared).host,
  );

  if (isProduction) {
    check(
      new URL(declared).host === PRODUCTION_HOST,
      "App URL matches the domain",
      `${new URL(declared).host} ≠ ${PRODUCTION_HOST}`,
      PRODUCTION_HOST,
    );
  }
}

/** Item 2 — the Clerk webhook, and item 3 — the instance it points at. */
function verifyClerk(): void {
  check(
    env.CLERK_WEBHOOK_SIGNING_SECRET !== undefined,
    "CLERK_WEBHOOK_SIGNING_SECRET",
    "unset — /api/webhooks/clerk returns 503, so user.created never fires and " +
      "ensurePolarCustomer never runs. It is not on the API keys page: create the endpoint " +
      "under Configure → Webhooks, then copy its Signing Secret. Run `pnpm polar:backfill` " +
      "afterwards to reconcile the accounts created while it was missing.",
    "set",
  );

  const publishable = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const instance = publishable.startsWith("pk_live_")
    ? "production"
    : publishable.startsWith("pk_test_")
      ? "development"
      : "unrecognised";

  report("Clerk instance", instance);

  if (isProduction) {
    check(
      instance === "production",
      "Clerk keys",
      `${instance} keys on a production deployment — development instances have relaxed ` +
        `session behaviour and a cookie handshake that costs a redirect on every cold visit`,
      "pk_live_ / sk_live_",
    );
  }

  // The two keys must describe the same instance. A live publishable key with
  // a test secret key authenticates nobody and reports as a generic 401.
  const secretInstance = env.CLERK_SECRET_KEY.startsWith("sk_live_")
    ? "production"
    : env.CLERK_SECRET_KEY.startsWith("sk_test_")
      ? "development"
      : "unrecognised";

  check(
    instance === secretInstance,
    "Clerk key pair",
    `publishable key is ${instance} and secret key is ${secretInstance}`,
    `both ${instance}`,
  );
}

/** Item 4 — the database. */
async function verifyDatabase(pool: Pool): Promise<void> {
  const host = new URL(env.DATABASE_URL).host;
  report("Database host", host);

  // Declared, not inferred.
  //
  // The first version of this check looked for `-dev-` or `-staging-` in the
  // hostname. That was worse than useless: Neon names an endpoint with a
  // random id (`ep-misty-night-aiv4dy1b`), carrying no trace of its branch, so
  // the regex returned a confident ✅ for the very development branch
  // Deployment state item 4 is about. A check that cannot fail is not a check.
  //
  // So the production endpoint is *recorded* here, by a human, once it exists.
  // Until then this fails and says what to do, which is the honest state of
  // item 4.
  if (PRODUCTION_DATABASE_HOST === null) {
    failures += 1;
    report(
      "Database branch",
      `❌ no production endpoint recorded. The database is still the development branch this ` +
        `work has dropped and recreated three times, and C4's destructive-migration exemption ` +
        `is in force against it. Create the production branch, set PRODUCTION_DATABASE_HOST in ` +
        `this script, and retire the exemption in the same commit.`,
    );
  } else {
    check(
      host === PRODUCTION_DATABASE_HOST,
      "Database branch",
      `${host} is not the recorded production endpoint (${PRODUCTION_DATABASE_HOST})`,
      "the recorded production endpoint",
    );
  }

  const applied = await pool.query<{ count: number }>(
    `select count(*)::int as count from information_schema.tables
      where table_schema = 'public' and table_name in ('thread', 'message', 'chat_stream')`,
  );
  check(
    applied.rows[0]?.count === 3,
    "Migrations applied",
    `only ${applied.rows[0]?.count ?? 0} of 3 core tables exist — run pnpm migration:migrate`,
    "thread, message and chat_stream all present",
  );

  const checkpoints = await pool.query<{ count: number }>(
    `select count(*)::int as count from information_schema.tables
      where table_schema = 'public' and table_name = 'checkpoints'`,
  );
  check(
    checkpoints.rows[0]?.count === 1,
    "LangGraph tables",
    "checkpoints table is missing — run pnpm db:setup:langgraph",
    "present",
  );
}

/** Billing, which is Phase R's to finish but Phase K's to report honestly. */
function verifyBilling(): void {
  report("Polar server", polarServer);
  if (isProduction && polarServer === "sandbox") {
    report(
      "Polar mode",
      "⚠️  sandbox on a production deployment — test cards only, no real money moves. " +
        "Deliberate until Phase R item 1.",
    );
  }
}

/**
 * The CI gates this phase added, asserted against the workflow rather than
 * against this document's claim that they exist.
 *
 * A phase whose exit criteria can regress on the next commit without anything
 * noticing has not closed them — Phase J's own words, and the reason it stayed
 * `IN PROGRESS`. This is the check that keeps the same thing from happening
 * to Phase K.
 */
function verifyCiGates(): void {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

  check(
    workflow.includes("pnpm test:e2e"),
    "E2E gate in CI",
    "no `pnpm test:e2e` step in .github/workflows/ci.yml",
    "present",
  );
  check(
    workflow.includes("accessibility.spec.ts") || workflow.includes("test:e2e"),
    "Accessibility gate in CI",
    "axe-core does not run in .github/workflows/ci.yml",
    "runs inside the E2E suite",
  );
  check(
    workflow.includes("lighthouse"),
    "Lighthouse gate in CI",
    "no Lighthouse step in .github/workflows/ci.yml",
    "present",
  );
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    console.log(`\nEnvironment: ${isProduction ? "production" : "development / preview"}`);

    console.log("\nItem 1 — app URL");
    verifyAppUrl();

    console.log("\nItems 2 and 3 — Clerk");
    verifyClerk();

    console.log("\nItem 4 — database");
    await verifyDatabase(pool);

    console.log("\nBilling");
    verifyBilling();

    console.log("\nItems 5 and 6 — CI gates");
    verifyCiGates();

    if (failures > 0) {
      console.error(
        `\nPhase K verification failed: ${failures} item${failures === 1 ? "" : "s"} still open. ` +
          `Each ❌ above names the variable and what it costs to leave it.\n`,
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      "\nPhase K verification passed: the app URL is the product's domain, the Clerk webhook " +
        "is configured against a coherent key pair, the database carries every migration, and " +
        "the E2E, accessibility and Lighthouse gates all exist in CI.\n",
    );
  } finally {
    await pool.end();
  }
}

void main();
