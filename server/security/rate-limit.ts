/**
 * Rate limiting and concurrency control for the chat endpoint.
 *
 * Three limits, in ascending cost order, and the cheapest one that rejects
 * wins:
 *
 *  1. per user, sliding window — the limit that matches how the product is
 *     priced, and the one a legitimate-but-runaway client meets;
 *  2. per IP, sliding window — catches many throwaway accounts driven from one
 *     machine, which the per-user limit cannot see;
 *  3. concurrent streams per user — the only one that bounds *cost* rather
 *     than request count. A single streamed turn can run for a minute and
 *     spend far more than a rejected burst of a hundred, so capping in-flight
 *     work is what actually contains the provider bill.
 *
 * All three throw `AppError("RATE_LIMITED")` carrying the seconds to wait, so
 * every rejection reaches the client as a 429 with a `Retry-After` it can
 * honour, rather than as a generic failure it will retry immediately.
 */

import { randomUUID } from "node:crypto";
import {
  IP_REQUESTS_PER_MINUTE,
  planLimits,
  RATE_LIMIT_WINDOW_MS,
  STREAM_LEASE_TTL_MS,
  secondsUntil,
  type PlanId,
} from "@/lib/billing/plan-policy";
import {
  acquireStreamLease,
  consumeWindow,
  nextStreamSlotFreeAt,
  releaseStreamLease,
  sweepRateLimitBuckets,
  type StreamLease,
} from "@/server/db/rate-limit-repository";
import { AppError } from "@/server/lib/app-error";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

/** Scope prefix, so a future endpoint's counters cannot collide with chat's. */
const CHAT_SCOPE = "chat";

/** Counters are swept once they are two windows stale and can no longer be read. */
const SWEEP_AFTER_MS = RATE_LIMIT_WINDOW_MS * 4;
/** Fraction of requests that also pay for a sweep. Cheap, off the response path. */
const SWEEP_PROBABILITY = 0.02;

const RATE_LIMIT_MESSAGE = "You're sending messages too quickly. Please slow down and try again.";

export function userBucketKey(userId: string): string {
  return `${CHAT_SCOPE}:user:${userId}`;
}

export function ipBucketKey(ip: string): string {
  return `${CHAT_SCOPE}:ip:${ip}`;
}

export type ChatRateLimitParams = {
  userId: string;
  planId: PlanId;
  /** Null when no proxy header carried one; the per-IP limit is then skipped. */
  clientIp: string | null;
  now: Date;
  log?: Logger;
};

/**
 * Applies the two sliding windows. Throws on the first that rejects.
 *
 * The per-user window runs first so an authenticated abuser is attributed to
 * their account in the logs before the shared IP counter is touched, and so a
 * user behind a busy NAT is never rejected for someone else's traffic when
 * their own limit had room.
 */
export async function assertWithinRateLimit(params: ChatRateLimitParams): Promise<void> {
  const log = params.log ?? rootLogger;
  const limits = planLimits(params.planId);

  const byUser = await consumeWindow({
    bucketKey: userBucketKey(params.userId),
    limit: limits.requestsPerMinute,
    windowMs: RATE_LIMIT_WINDOW_MS,
    now: params.now,
  });

  if (!byUser.allowed) {
    log.warn("ratelimit.user_rejected", {
      userId: params.userId,
      planId: params.planId,
      limit: byUser.limit,
      weightedHits: byUser.weightedHits,
      retryAfterSeconds: byUser.retryAfterSeconds,
    });
    throw rateLimited(byUser.retryAfterSeconds, "user");
  }

  if (params.clientIp !== null) {
    const byIp = await consumeWindow({
      bucketKey: ipBucketKey(params.clientIp),
      limit: IP_REQUESTS_PER_MINUTE,
      windowMs: RATE_LIMIT_WINDOW_MS,
      now: params.now,
    });

    if (!byIp.allowed) {
      log.warn("ratelimit.ip_rejected", {
        userId: params.userId,
        limit: byIp.limit,
        weightedHits: byIp.weightedHits,
        retryAfterSeconds: byIp.retryAfterSeconds,
      });
      throw rateLimited(byIp.retryAfterSeconds, "ip");
    }
  }
}

/**
 * Takes one of the user's concurrent-stream slots.
 *
 * The returned handle must be released — `releaseChatStreamSlot` is wired to
 * the response stream settling in `server/chat/chat-service.ts`, so a client
 * that disconnects mid-answer frees its slot rather than holding it for the
 * lease TTL.
 */
export async function acquireChatStreamSlot(params: {
  userId: string;
  planId: PlanId;
  now: Date;
  log?: Logger;
}): Promise<StreamLease> {
  const log = params.log ?? rootLogger;
  const ownerKey = userBucketKey(params.userId);
  const slots = planLimits(params.planId).concurrentStreams;

  const lease = await acquireStreamLease({
    ownerKey,
    slots,
    leaseId: randomUUID(),
    ttlMs: STREAM_LEASE_TTL_MS,
  });

  if (lease !== null) return lease;

  const freeAt = await nextStreamSlotFreeAt(ownerKey);
  const retryAfter = freeAt === null ? 5 : Math.min(secondsUntil(freeAt, params.now), 30);

  log.warn("ratelimit.stream_slot_rejected", {
    userId: params.userId,
    planId: params.planId,
    slots,
    retryAfterSeconds: retryAfter,
  });

  throw new AppError(
    "RATE_LIMITED",
    slots === 1
      ? "You already have a reply in progress. Wait for it to finish before sending another."
      : `You already have ${slots} replies in progress. Wait for one to finish before sending another.`,
    { retryAfterSeconds: retryAfter },
  );
}

/** Releases a slot. Never throws: a failed release must not fail a finished turn. */
export async function releaseChatStreamSlot(
  lease: StreamLease,
  log: Logger = rootLogger,
): Promise<void> {
  try {
    await releaseStreamLease(lease);
  } catch (error) {
    // The lease TTL is the backstop, so the slot frees itself either way.
    log.error("ratelimit.stream_slot_release_failed", { slot: lease.slot }, error);
  }
}

/**
 * Occasionally clears out counters whose windows have passed.
 *
 * Probabilistic rather than scheduled so it needs no cron and no lock, and
 * bounded by the sweep's own cheapness: one indexed range delete. Never
 * throws — housekeeping must not fail a request.
 */
export async function maybeSweepRateLimits(now: Date, log: Logger = rootLogger): Promise<void> {
  if (Math.random() >= SWEEP_PROBABILITY) return;

  try {
    await sweepRateLimitBuckets(new Date(now.getTime() - SWEEP_AFTER_MS));
  } catch (error) {
    log.error("ratelimit.sweep_failed", {}, error);
  }
}

function rateLimited(retryAfterSeconds: number | null, scope: "user" | "ip"): AppError {
  return new AppError("RATE_LIMITED", RATE_LIMIT_MESSAGE, {
    cause: new Error(`Sliding window exceeded for scope "${scope}".`),
    ...(retryAfterSeconds === null ? {} : { retryAfterSeconds }),
  });
}
