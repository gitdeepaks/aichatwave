/**
 * Sliding-window-counter arithmetic, kept pure so it can be tested without a
 * database.
 *
 * The algorithm is the standard two-bucket approximation: each key gets one
 * counter per fixed window, and a request is judged against the current
 * counter plus the share of the previous one that has not yet rolled off. It
 * costs two integers per key instead of one row per request, and it has none
 * of the boundary burst a plain fixed window has — at the instant a fixed
 * window resets a client can send 2x the limit, which is exactly the moment an
 * abusive client is watching for.
 *
 * The SQL that applies it lives in `server/db/rate-limit-repository.ts`; this
 * module decides what the numbers mean.
 */

export type WindowBounds = {
  /** Start of the window the request falls in. */
  currentStart: Date;
  /** Start of the window before it, whose tail still counts. */
  previousStart: Date;
  /** Milliseconds elapsed inside the current window. */
  elapsedMs: number;
};

/**
 * Windows are aligned to the epoch rather than to first contact, so every
 * process and every replica agrees on where a window starts without
 * coordinating.
 */
export function windowBounds(now: Date, windowMs: number): WindowBounds {
  const currentStartMs = Math.floor(now.getTime() / windowMs) * windowMs;
  return {
    currentStart: new Date(currentStartMs),
    previousStart: new Date(currentStartMs - windowMs),
    elapsedMs: now.getTime() - currentStartMs,
  };
}

/** The fraction of the previous window's count that still counts against the caller. */
export function previousWindowWeight(elapsedMs: number, windowMs: number): number {
  if (windowMs <= 0) return 0;
  const remaining = 1 - elapsedMs / windowMs;
  return Math.min(1, Math.max(0, remaining));
}

export type WindowCounts = {
  currentHits: number;
  previousHits: number;
};

export function weightedHits(counts: WindowCounts, elapsedMs: number, windowMs: number): number {
  return counts.previousHits * previousWindowWeight(elapsedMs, windowMs) + counts.currentHits;
}

/**
 * Seconds a rejected caller must wait before the weighted count can fall below
 * the limit.
 *
 * Computed rather than guessed, because `Retry-After` is a promise: a client
 * that honours it and is still rejected learns to ignore it. Two cases:
 *
 *  - the current window alone is under the limit, so only the previous
 *    window's decay is binding — solve for the moment it has decayed enough;
 *  - the current window is already at or over the limit on its own, so nothing
 *    helps until it becomes the *previous* window and decays in turn.
 *
 * `counts` are the values that were read when the request was rejected, so the
 * answer is exact for a caller that stops sending, and conservative for one
 * that does not.
 */
export function retryAfterSeconds(params: {
  counts: WindowCounts;
  limit: number;
  windowMs: number;
  elapsedMs: number;
}): number {
  const { counts, limit, windowMs, elapsedMs } = params;
  const remainingInWindowMs = Math.max(0, windowMs - elapsedMs);

  if (limit <= 0) return Math.ceil(windowMs / 1000);

  if (counts.currentHits >= limit) {
    // Even with the previous window fully gone, the current one blocks. Wait
    // for it to roll over, then for its own decay.
    const decayMs = windowMs * (1 - limit / counts.currentHits);
    return toSeconds(remainingInWindowMs + decayMs);
  }

  const headroom = limit - counts.currentHits;
  if (counts.previousHits <= 0 || counts.previousHits <= headroom) {
    // Nothing is binding any more; the rejection was the boundary case.
    return 1;
  }

  // previousHits * (1 - (elapsed + t) / window) < headroom
  const targetElapsedMs = windowMs * (1 - headroom / counts.previousHits);
  return toSeconds(Math.min(remainingInWindowMs, Math.max(0, targetElapsedMs - elapsedMs)));
}

function toSeconds(milliseconds: number): number {
  return Math.max(1, Math.ceil(milliseconds / 1000));
}
