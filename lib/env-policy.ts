/**
 * When runtime-only configuration must be present.
 *
 * Deliberately separate from `lib/env.ts`: that module validates the process
 * environment as an import side effect and throws when it is incomplete, so
 * anything importing it inherits that crash. This policy is pure, so it can be
 * tested without a fully populated environment.
 */

/** Next sets this while `next build` runs, and leaves it unset when serving. */
export const NEXT_BUILD_PHASE = "phase-production-build";

/**
 * `next build` runs with `NODE_ENV=production` but talks to nothing: it only
 * needs `NEXT_PUBLIC_*` values, which get inlined into the client bundle.
 * Enforcing a runtime-only setting during the build turns a config value into a
 * deploy blocker without preventing any misconfiguration from reaching users —
 * the same check still runs when the server starts, so a bad config fails the
 * deployment's first request rather than shipping unnoticed.
 */
export function requiresRuntimeConfig(params: {
  nodeEnv: string;
  nextPhase: string | undefined;
}): boolean {
  if (params.nextPhase === NEXT_BUILD_PHASE) return false;
  return params.nodeEnv === "production";
}
