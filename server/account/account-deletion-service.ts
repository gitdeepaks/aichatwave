import { clerkClient } from "@clerk/nextjs/server";
import { polarClient } from "@/lib/polar-client";
import {
  accountDeletionCompleted,
  accountDeletionStarted,
  beginAccountDeletion,
  completeAccountDeletion,
  deleteLocalAccountData,
  hasActiveStreamLease,
} from "@/server/account/account-deletion-repository";
import { polarErrorFacts } from "@/server/billing/polar-error";
import { AppError } from "@/server/lib/app-error";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

export async function assertAccountActive(userId: string): Promise<void> {
  if (await accountDeletionStarted(userId)) {
    throw new AppError("CONFLICT", "Account deletion is in progress.");
  }
}

function errorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  return typeof error.status === "number" ? error.status : null;
}

async function deletePolarCustomer(userId: string): Promise<void> {
  try {
    await polarClient.customers.deleteExternal({ externalId: userId, anonymize: true });
  } catch (error) {
    if (polarErrorFacts(error).upstreamStatus !== 404) throw error;
  }
}

async function deleteClerkIdentity(userId: string): Promise<void> {
  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch (error) {
    if (errorStatus(error) !== 404) throw error;
  }
}

export async function deleteAccount(params: {
  userId: string;
  identityAlreadyGone?: boolean;
  log?: Logger;
}): Promise<void> {
  const log = params.log ?? rootLogger;
  await beginAccountDeletion(params.userId);
  if (await accountDeletionCompleted(params.userId)) return;

  if (await hasActiveStreamLease(params.userId, new Date())) {
    throw new AppError(
      "CONFLICT",
      "A reply is still in progress. Wait for it to finish, then retry account deletion.",
    );
  }

  // Clerk deletion does not cancel an external subscription. This remains
  // necessary when cleanup was initiated by Clerk's user.deleted webhook.
  await deletePolarCustomer(params.userId);
  await deleteLocalAccountData(params.userId);
  if (params.identityAlreadyGone !== true) await deleteClerkIdentity(params.userId);
  await completeAccountDeletion(params.userId);
  log.info("account.deleted", { userId: params.userId });
}
