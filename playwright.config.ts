import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration. Phase K item 5.
 *
 * These tests drive a **production build** against a **real database** and a
 * **real Clerk development instance**, because the things they exist to catch
 * only happen there: a middleware rule that redirects a signed-in user, a
 * stream that does not resume after a reload, a build-only env guard. A dev
 * server and a stubbed session would pass while production failed, which is
 * the failure mode Phase I's integration suite already covers from the inside.
 *
 * Chromium only, deliberately. The accessibility gate (`accessibility.spec.ts`)
 * runs axe-core and the performance gate runs Lighthouse, and both are
 * Chromium engines — so a WebKit and Firefox pass would triple the job's
 * duration to assert something neither gate measures. Cross-browser rendering
 * is not what this suite is for. If a Safari-specific defect ever ships, add
 * the project then and say why in this comment.
 */

const PORT = Number(process.env["E2E_PORT"] ?? 3000);
const baseURL = process.env["E2E_BASE_URL"] ?? `http://127.0.0.1:${PORT}`;

/** Where `global.setup.ts` writes the signed-in browser state the specs reuse. */
export const STORAGE_STATE = "tests/e2e/.auth/user.json";

export default defineConfig({
  testDir: "./tests/e2e",
  // `.spec.ts`, not `.test.ts`: `pnpm test` globs `tests/**/*.test.ts` into the
  // `node --test` runner, and a Playwright file loaded by that runner fails in
  // a way that reads like a broken test rather than a misrouted one.
  testMatch: /.*\.spec\.ts/,

  // A streamed answer from a real provider is the slowest thing here, and it
  // is not made faster by a shorter timeout — it is only made flaky.
  timeout: 90_000,
  expect: { timeout: 15_000 },

  // One retry on CI absorbs provider jitter; zero locally, so a flake is
  // visible to the person who wrote it rather than hidden by a rerun.
  retries: process.env["CI"] === undefined ? 0 : 1,

  // Serial on CI. These tests share one account, and the free plan allows a
  // single concurrent stream (`PLAN_LIMITS.free.concurrentStreams`), so two
  // workers would race each other into a 429 that is the rate limiter working
  // correctly and the suite failing anyway.
  workers: 1,
  fullyParallel: false,

  // Fail the build rather than pass a suite that was accidentally committed
  // with a `.only` on one test.
  forbidOnly: process.env["CI"] !== undefined,

  reporter: process.env["CI"] === undefined ? [["list"]] : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    // Signs in once, writes `STORAGE_STATE`, and every other project depends
    // on it. Signing in per test would be correct and roughly ten times
    // slower, and the sign-in path itself is asserted once, in `auth.spec.ts`.
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],

  /**
   * `pnpm start`, never `pnpm dev`.
   *
   * The build is a separate step so CI can run it once and share it with the
   * Lighthouse job, and so a failed build reports as a failed build rather
   * than as a timed-out web server. Locally that means `pnpm build` first;
   * `pnpm test:e2e` does it for you.
   *
   * **The build must be made with `NEXT_PUBLIC_APP_URL` set to `baseURL`**,
   * which is why `test:e2e` sets it rather than leaving it to `.env`.
   *
   * Phase D made `NEXT_PUBLIC_APP_URL` the source of Clerk's
   * `authorizedParties`, and `resolveAuthorizedParties` falls back to the
   * request's own origin only when `NODE_ENV === "development"` — which
   * `pnpm start` is not. So a build made against a developer's `.env`
   * (`https://www.aichatwave.in`) rejects every session from `127.0.0.1`
   * **server-side while the browser holds a valid one**: protected routes
   * bounce to sign-in, and the only clue is a Clerk log line blaming
   * mismatched instance keys, which is not the problem.
   *
   * It cannot be fixed by `webServer.env`. `NEXT_PUBLIC_*` values are inlined
   * into the bundle at build time, so at runtime there is no variable left to
   * override — the string is already compiled in. `global.setup.ts` checks for
   * the mismatch and says so rather than letting it present as a broken login.
   */
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: process.env["CI"] === undefined,
    stdout: "pipe",
    stderr: "pipe",
  },
});
