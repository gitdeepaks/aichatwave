/**
 * Creates the Polar customers that `user.created` never created.
 *
 * `CLERK_WEBHOOK_SIGNING_SECRET` was unset in production, so
 * `/api/webhooks/clerk` answered 503 to every delivery. User rows still
 * appeared, because `server/auth/user-service.ts` provisions just-in-time on
 * first write — but `ensurePolarCustomer` rides on the `user.created` branch of
 * that webhook and therefore never ran. Every account created in that window
 * has a local row and no Polar customer, and a subscription keyed to a
 * customer that does not exist is a checkout that fails at the till.
 *
 * Setting the secret fixes the next sign-up. This fixes the ones already made.
 *
 * Safe to run repeatedly: `ensurePolarCustomer` asks Polar for the customer by
 * external id first and returns without writing if it is already there. Safe to
 * run before the secret is set, too — it reads the database, not the webhook.
 *
 * ## When an account cannot be reconciled
 *
 * Two cases turned up on real accounts, and neither is fixable from here.
 *
 * **A reserved address.** `user-service.ts` falls back to
 * `<id>@placeholder.invalid` when a provider returns no email. `.invalid` is a
 * reserved TLD and Polar rejects it, so `ensurePolarCustomer` now skips those
 * accounts rather than failing on every `user.created`.
 *
 * **A customer holding a stale external id.** A Polar customer created before
 * the Better Auth → Clerk migration (Phase A2) still carries the old identity.
 * `getExternal` misses it, `create` refuses the duplicate email, and — this is
 * the part worth knowing — **Polar will not let an external id be changed**:
 * `PolarRequestValidationError: Customer external ID cannot be updated`. There
 * is no API-side repair. The customer must be deleted or merged in the Polar
 * dashboard, after which this script creates a correctly-keyed one.
 *
 * Usage: pnpm polar:backfill [--dry-run] [--relink-orphans]
 */

import { closeDatabase, db } from "@/db";
import { polarClient } from "@/lib/polar-client";

/** Mirrors the fallback `server/auth/user-service.ts` writes when a provider returns no address. */
const PLACEHOLDER_EMAIL_SUFFIX = "@placeholder.invalid";
import { user } from "@/db/schema/auth-schema";
import { ensurePolarCustomer } from "@/server/billing/checkout-service";
import { polarServer } from "@/lib/env";
import { logger } from "@/server/lib/logger";

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const log = logger.child({ script: "polar:backfill" });

  try {
    const rows = await db.select({ id: user.id, email: user.email, name: user.name }).from(user);

    console.log(`\nPolar server: ${polarServer}`);
    console.log(`Accounts to reconcile: ${rows.length}${dryRun ? " (dry run)" : ""}\n`);

    if (dryRun) {
      for (const row of rows) console.log(`  would ensure ${row.id} <${row.email}>`);
      console.log("\nNothing was written.\n");
      return;
    }

    let linked = 0;
    const skipped: string[] = [];
    const failed: string[] = [];

    for (const row of rows) {
      // Sequentially, not with `Promise.all`. Polar rate-limits, this runs
      // once after an incident rather than on a request path, and a backfill
      // that trips a rate limit halfway leaves a worse mess than one that
      // takes a minute.
      await ensurePolarCustomer({ userId: row.id, email: row.email, name: row.name, log });

      // Verified, not assumed.
      //
      // `ensurePolarCustomer` is deliberately non-fatal — a billing failure
      // must never block a sign-in — so it swallows its errors and returns
      // `void`. A backfill that printed a tick per call therefore reported
      // three successes for one success and two failures, which is worse than
      // not reporting at all. The only honest answer is to ask Polar.
      if (await isLinked(row.id)) {
        linked += 1;
        console.log(`  ✅ ${row.id} <${row.email}>`);
        continue;
      }

      // A skip is not a failure. `ensurePolarCustomer` declines these on
      // purpose — Polar rejects the reserved `.invalid` TLD — so counting them
      // as failures would leave this script permanently red for an account
      // that is behaving exactly as designed.
      if (row.email.endsWith(PLACEHOLDER_EMAIL_SUFFIX)) {
        skipped.push(`${row.id} <${row.email}>`);
        console.log(`  ⏭️  ${row.id} <${row.email}> — no billable address, skipped by design`);
        continue;
      }

      failed.push(`${row.id} <${row.email}>`);
      console.log(`  ❌ ${row.id} <${row.email}> — still has no Polar customer`);
    }

    console.log(
      `\nLinked ${linked} of ${rows.length} account${rows.length === 1 ? "" : "s"}` +
        `${skipped.length > 0 ? `, ${skipped.length} skipped` : ""}.`,
    );

    if (failed.length > 0) {
      console.error(
        `\n${failed.length} account${failed.length === 1 ? "" : "s"} could not be reconciled. ` +
          `The reason is in the billing.* log lines above. The one that is not self-explanatory ` +
          `is a customer already holding a different external id: Polar does not allow an ` +
          `external id to be changed, so free the address by renaming that customer's email (its ` +
          `history is preserved) or delete it, then run this again.\n`,
      );
      process.exitCode = 1;
      return;
    }

    console.log("Every billable account resolves by external id.\n");
  } finally {
    await closeDatabase();
  }
}

/** Whether Polar resolves this user id as a customer's external id. */
async function isLinked(userId: string): Promise<boolean> {
  try {
    await polarClient.customers.getExternal({ externalId: userId });
    return true;
  } catch {
    return false;
  }
}

void main();
