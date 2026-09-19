/**
 * Consent for long-term memory.
 *
 * This product stores durable facts about a person — "prefers TypeScript",
 * "works at X", whatever an extraction model decides is worth keeping — and
 * until Phase J it did so without ever asking. That is the gap this module
 * closes, and it closes it at the write path rather than in the UI: a dialog
 * nobody reads is not consent, and a toggle the server does not honour is a
 * lie in a nicer font.
 *
 * ## Three states, not two
 *
 * `undecided` is the state a new account is in, and it is distinct from
 * `declined`. Only `granted` permits a write. That asymmetry is the whole
 * design: the safe reading of "we have not asked yet" is "no", while the
 * user-facing difference between "not yet asked" and "said no" is whether to
 * show the dialog again.
 *
 * ## Reads are separate from writes
 *
 * Declining stops new memories being extracted. It deliberately does *not*
 * hide or delete what is already stored — that is what the Memory Center's
 * delete is for, and silently orphaning data the user can no longer see is a
 * worse outcome than leaving it visible and deletable. Injection into the
 * prompt does stop, because that is a use of the data, not a record of it.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema/auth-schema";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

/** The decision a user can make. Mirrors the `memory_consent` pg enum. */
export const MEMORY_CONSENT_DECISIONS = ["granted", "declined"] as const;
export type MemoryConsentDecision = (typeof MEMORY_CONSENT_DECISIONS)[number];

/** The decision, plus the state that is the absence of one. */
export type MemoryConsentState = MemoryConsentDecision | "undecided";

export type MemoryConsent = {
  state: MemoryConsentState;
  /** When the decision was recorded. Null exactly when `state` is `undecided`. */
  decidedAt: Date | null;
};

const UNDECIDED: MemoryConsent = { state: "undecided", decidedAt: null };

/**
 * This user's consent.
 *
 * A missing `user` row reads as `undecided` rather than throwing. The row is
 * provisioned just-in-time on the first write, so a brand-new session can
 * legitimately reach here before it exists, and "we have not asked" is exactly
 * the right answer in that case.
 */
export async function readMemoryConsent(userId: string): Promise<MemoryConsent> {
  const rows = await db
    .select({ consent: user.memoryConsent, decidedAt: user.memoryConsentAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  const row = rows[0];
  if (row === undefined || row.consent === null) return UNDECIDED;

  return { state: row.consent, decidedAt: row.decidedAt };
}

/**
 * Records a decision. Idempotent — re-granting an existing grant only moves
 * the timestamp, which is the audit trail this feature is expected to have.
 *
 * Returns the stored state rather than assuming the write landed: a row that
 * does not exist (an account mid-deletion) updates nothing, and the caller
 * must not report success for a decision the database did not keep.
 */
export async function setMemoryConsent(params: {
  userId: string;
  decision: MemoryConsentDecision;
  log?: Logger;
}): Promise<MemoryConsent> {
  const log = params.log ?? rootLogger;
  const decidedAt = new Date();

  const updated = await db
    .update(user)
    .set({ memoryConsent: params.decision, memoryConsentAt: decidedAt })
    .where(eq(user.id, params.userId))
    .returning({ consent: user.memoryConsent, decidedAt: user.memoryConsentAt });

  const row = updated[0];
  if (row === undefined || row.consent === null) {
    log.warn("memory.consent_not_recorded", { userId: params.userId, decision: params.decision });
    return UNDECIDED;
  }

  log.info("memory.consent_recorded", { userId: params.userId, decision: params.decision });
  return { state: row.consent, decidedAt: row.decidedAt };
}

/**
 * Whether memory may be read or written for this user.
 *
 * The single predicate both the chat path and the routes ask. Written as one
 * function so "granted, or nothing" cannot be spelled two different ways in
 * two places — which is how a feature flag ends up enforced on one path and
 * not the other.
 */
export function memoryIsPermitted(consent: MemoryConsent): boolean {
  return consent.state === "granted";
}
