/**
 * Plan limits and usage-period arithmetic.
 *
 * Client-safe: pure data and pure functions, no env access and no server
 * imports, so the composer and the profile page can render "412 of 500 used"
 * from the same numbers the server enforces. A limit that lived only on the
 * server would drift from whatever the UI told the user it was.
 *
 * Every limit is expressed here and nowhere else. `assertWithinQuota` and the
 * rate limiter both read this module rather than restating a number.
 */

export const PLAN_IDS = ["free", "pro"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

export type PlanLimits = {
  /** Chat turns a user may start per calendar month (UTC). */
  monthlyMessages: number;
  /** Sliding-window chat requests per minute, per user. */
  requestsPerMinute: number;
  /** Chat streams one user may hold open at the same time. */
  concurrentStreams: number;
};

/**
 * The free tier is sized to be a real trial and a poor botnet: a month of
 * ordinary use, but nowhere near enough to be worth automating. Pro is sized
 * well above any human's throughput, so the per-minute window — not the
 * monthly total — is what a runaway client meets first.
 */
export const PLAN_LIMITS = {
  free: {
    monthlyMessages: 150,
    requestsPerMinute: 10,
    concurrentStreams: 1,
  },
  pro: {
    monthlyMessages: 5_000,
    requestsPerMinute: 60,
    concurrentStreams: 3,
  },
} as const satisfies Record<PlanId, PlanLimits>;

/**
 * Per-IP ceiling, applied on top of the per-user one and shared by every plan.
 *
 * It exists for the case the per-user limit cannot see: many accounts driven
 * from one machine. It is deliberately loose enough for a shared office or a
 * carrier NAT to pass — it bounds a script, it does not police a household.
 */
export const IP_REQUESTS_PER_MINUTE = 90;

/** Width of every sliding window in this app. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * How long a stream lease survives without being released.
 *
 * A lease is released when the response stream settles, so this only matters
 * when a process dies mid-stream. Long enough to cover the slowest legitimate
 * generation, short enough that a crash does not lock a user out for a shift.
 */
export const STREAM_LEASE_TTL_MS = 5 * 60_000;

export function planLimits(planId: PlanId): PlanLimits {
  return PLAN_LIMITS[planId];
}

/** The single place a subscription flag becomes a plan. */
export function planFromSubscription(hasActiveSubscription: boolean): PlanId {
  return hasActiveSubscription ? "pro" : "free";
}

export type UsagePeriod = {
  /** Inclusive start of the period, always midnight UTC on the first. */
  start: Date;
  /** Exclusive end of the period; the moment the allowance resets. */
  end: Date;
};

/**
 * The UTC calendar month containing `now`.
 *
 * Calendar months rather than rolling 30-day windows because that is what the
 * user is told ("resets on month end") and what Polar's meters bill on; two
 * different period definitions would make the profile page disagree with the
 * enforcement.
 */
export function usagePeriodFor(now: Date): UsagePeriod {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export type QuotaSnapshot = {
  planId: PlanId;
  used: number;
  limit: number;
  remaining: number;
  resetAt: Date;
};

export function quotaSnapshot(params: { planId: PlanId; used: number; now: Date }): QuotaSnapshot {
  const limit = planLimits(params.planId).monthlyMessages;
  return {
    planId: params.planId,
    used: params.used,
    limit,
    remaining: Math.max(0, limit - params.used),
    resetAt: usagePeriodFor(params.now).end,
  };
}

/** Whole seconds until the allowance resets, never below one. */
export function secondsUntil(target: Date, now: Date): number {
  return Math.max(1, Math.ceil((target.getTime() - now.getTime()) / 1000));
}
