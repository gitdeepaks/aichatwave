import { and, eq, gt, sql } from "drizzle-orm";
import { db, type Database } from "@/db";
import { accountDeletion, user } from "@/db/schema/auth-schema";
import { thread } from "@/db/schema/chat-schema";
import { rateLimitBucket, streamLease } from "@/db/schema/limits-schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function beginAccountDeletion(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    await tx.insert(accountDeletion).values({ userId }).onConflictDoNothing();
  });
}

export async function accountDeletionStarted(userId: string): Promise<boolean> {
  const rows = await db
    .select({ userId: accountDeletion.userId })
    .from(accountDeletion)
    .where(eq(accountDeletion.userId, userId))
    .limit(1);
  return rows.length > 0;
}

export async function accountDeletionCompleted(userId: string): Promise<boolean> {
  const rows = await db
    .select({ completedAt: accountDeletion.completedAt })
    .from(accountDeletion)
    .where(eq(accountDeletion.userId, userId))
    .limit(1);
  return rows[0]?.completedAt !== null && rows[0]?.completedAt !== undefined;
}

export async function hasActiveStreamLease(userId: string, now: Date): Promise<boolean> {
  const rows = await db
    .select({ ownerKey: streamLease.ownerKey })
    .from(streamLease)
    .where(and(eq(streamLease.ownerKey, `chat:user:${userId}`), gt(streamLease.expiresAt, now)))
    .limit(1);
  return rows.length > 0;
}

async function deleteCheckpointState(tx: Transaction, threadIds: string[]): Promise<void> {
  if (threadIds.length === 0) return;
  const ids = sql.join(
    threadIds.map((threadId) => sql`${threadId}`),
    sql`, `,
  );
  await tx.execute(sql`delete from checkpoint_blobs where thread_id in (${ids})`);
  await tx.execute(sql`delete from checkpoint_writes where thread_id in (${ids})`);
  await tx.execute(sql`delete from checkpoints where thread_id in (${ids})`);
}

export async function deleteLocalAccountData(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const ownedThreads = await tx
      .select({ id: thread.id })
      .from(thread)
      .where(eq(thread.userId, userId));
    await deleteCheckpointState(
      tx,
      ownedThreads.map((owned) => owned.id),
    );
    await tx.execute(sql`delete from store where namespace_path = ${`${userId}:memories`}`);
    await tx.delete(rateLimitBucket).where(eq(rateLimitBucket.bucketKey, `chat:user:${userId}`));
    await tx.delete(streamLease).where(eq(streamLease.ownerKey, `chat:user:${userId}`));
    await tx.delete(user).where(eq(user.id, userId));
    await tx
      .update(accountDeletion)
      .set({ localDeletedAt: new Date() })
      .where(eq(accountDeletion.userId, userId));
  });
}

export async function completeAccountDeletion(userId: string): Promise<void> {
  await db
    .update(accountDeletion)
    .set({ completedAt: new Date() })
    .where(eq(accountDeletion.userId, userId));
}
