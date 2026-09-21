/**
 * Whether this invocation also paid for a cold start.
 *
 * Phase L budgets time-to-first-token twice — 900ms warm, 1.8s cold — because
 * the two are different problems with different fixes, and averaging them
 * produces a number that hides both. Telling them apart needs one bit that only
 * the process itself knows: was this the first request I have served?
 *
 * A boolean flipped on first read is enough, and it is exact rather than
 * heuristic. It is not "was the process started recently", which is a guess
 * that gets a warm request wrong whenever traffic is sparse.
 *
 * **On `globalThis` for the reason `metrics.ts` documents**: Next builds route
 * handlers and server components into separate module graphs, so a plain
 * module-level `let` is instantiated twice in one process and the second graph
 * would report a second cold start that never happened.
 */

type ProcessLifecycle = {
  /** Set the first time an invocation claims the cold start, and never again. */
  coldStartClaimed: boolean;
};

declare global {
  // `var` rather than `let`: it is the only declaration that augments `globalThis`.
  var __aichatwaveProcessLifecycle: ProcessLifecycle | undefined;
}

function lifecycle(): ProcessLifecycle {
  globalThis.__aichatwaveProcessLifecycle ??= { coldStartClaimed: false };
  return globalThis.__aichatwaveProcessLifecycle;
}

/**
 * True for exactly one caller per process: the one that got here first.
 *
 * Claiming rather than asking, because two concurrent requests on a
 * just-started instance both saw a cold process and both would otherwise
 * report cold-start latency — doubling the sample and halving its meaning.
 */
export function claimColdStart(): boolean {
  const state = lifecycle();
  if (state.coldStartClaimed) return false;
  state.coldStartClaimed = true;
  return true;
}

/** Test seam: makes the next claim a cold start again. */
export function resetColdStart(): void {
  lifecycle().coldStartClaimed = false;
}
