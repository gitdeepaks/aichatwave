/**
 * Verifies this environment's Polar configuration without creating anything.
 *
 * Exists because a revoked token and a sandbox/production mismatch both surface
 * to users as one opaque failed checkout, and both are invisible until someone
 * tries to pay. Run it after any credential change, and in CI against staging.
 *
 * Read-only: lists products and resolves POLAR_PRODUCT_ID. It never creates a
 * checkout, customer, or session, so it is safe against a live organization.
 *
 * Usage: pnpm polar:doctor
 */

import { Polar } from "@polar-sh/sdk";
import { env, polarServer } from "@/lib/env";
import { polarErrorFacts } from "@/server/billing/polar-error";

type Check = { name: string; ok: boolean; detail: string };

/** The two environments have separate dashboards, which is a common mix-up. */
function dashboardUrl(server: "sandbox" | "production"): string {
  return server === "sandbox" ? "https://sandbox.polar.sh" : "https://polar.sh";
}

const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
}

async function main(): Promise<void> {
  const other = polarServer === "production" ? "sandbox" : "production";

  console.log(`\nPolar configuration check`);
  console.log(
    `  POLAR_SERVER      ${polarServer}${env.POLAR_SERVER === undefined ? "  (defaulted — set it explicitly)" : ""}`,
  );
  console.log(`  POLAR_PRODUCT_ID  ${env.POLAR_PRODUCT_ID}`);
  console.log(`  token             ${env.POLAR_ACCESS_TOKEN.slice(0, 14)}…`);
  console.log(`  dashboard         ${dashboardUrl(polarServer)}\n`);

  const client = new Polar({ accessToken: env.POLAR_ACCESS_TOKEN, server: polarServer });

  let products: Array<{ id: string; name: string; isArchived: boolean }> = [];
  try {
    const page = await client.products.list({ limit: 100 });
    products = (page.result?.items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      isArchived: item.isArchived,
    }));
    record("token is valid", true, `${products.length} product(s) visible on ${polarServer}`);
  } catch (error) {
    const facts = polarErrorFacts(error);
    record(
      "token is valid",
      false,
      `${facts.upstreamStatus ?? "?"} ${facts.upstreamCode ?? "error"} — ${facts.upstreamDetail ?? "no detail"}`,
    );

    // A token for the other environment is by far the most common cause, so
    // name it explicitly instead of leaving the operator to guess.
    try {
      const crossClient = new Polar({ accessToken: env.POLAR_ACCESS_TOKEN, server: other });
      await crossClient.products.list({ limit: 1 });
      record(
        "token matches POLAR_SERVER",
        false,
        `This token is valid on "${other}" but POLAR_SERVER is "${polarServer}". Set POLAR_SERVER=${other}, or issue a token for ${polarServer}.`,
      );
    } catch {
      record(
        "token matches POLAR_SERVER",
        false,
        `Token is rejected by both sandbox and production — it is expired or revoked. ` +
          `Issue a new one at ${dashboardUrl(polarServer)} (Settings -> Developers -> New Token). ` +
          `Note the sandbox dashboard is a separate site from the production one.`,
      );
    }

    report();
    return;
  }

  const product = products.find((item) => item.id === env.POLAR_PRODUCT_ID);
  if (!product) {
    record(
      "POLAR_PRODUCT_ID exists",
      false,
      `Not found on ${polarServer}. Products here: ${
        products.map((item) => `${item.id} (${item.name})`).join(", ") || "none"
      }`,
    );
  } else {
    record("POLAR_PRODUCT_ID exists", true, `${product.name}`);
    record(
      "product is not archived",
      !product.isArchived,
      product.isArchived ? "Archived products cannot be checked out." : "active",
    );
  }

  report();
}

function report(): void {
  let failed = false;
  for (const check of checks) {
    if (!check.ok) failed = true;
    console.log(`  ${check.ok ? "PASS" : "FAIL"}  ${check.name}\n        ${check.detail}`);
  }
  console.log(
    failed
      ? "\nPolar is misconfigured — checkout will fail.\n"
      : "\nPolar configuration is healthy.\n",
  );
  process.exitCode = failed ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error("polar:doctor failed to run:", error);
  process.exitCode = 1;
});
