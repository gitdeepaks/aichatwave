/**
 * Signs in once for the whole suite and saves the browser state.
 *
 * ## Why this does not drive the sign-in form
 *
 * This product is social-only by decision — Google, GitHub and LinkedIn, no
 * email and no password (ADR-0006). There is no credential for a test to type,
 * and automating a third-party OAuth consent screen is the flakiest thing a
 * suite can contain: it is someone else's markup, someone else's bot
 * detection, and someone else's rate limit.
 *
 * A **sign-in ticket** sidesteps all of it. The Backend API mints one for a
 * known user id and the browser redeems it, which bypasses first-factor
 * verification entirely. So the suite needs no password, no OTP, and no change
 * to the instance's enabled strategies — ADR-0006 holds unmodified, on the
 * test instance as well as in production.
 *
 * What that costs, stated plainly: **the real sign-in path is not covered by
 * this suite.** A regression in the social buttons themselves would not fail
 * CI. That is a deliberate trade — it buys a suite that can cover every
 * authenticated surface instead of one that cannot cover any — and it is
 * recorded as a known limitation in `docs/pro_plan.md`.
 *
 * ## Why the test user has a username and no email address
 *
 * Because on a social-only instance it cannot have one. `createUser` with an
 * `emailAddress` is rejected with `form_param_unknown` — email is not an
 * enabled identifier, so the Backend API will not accept it as one. A
 * `username` is accepted, which is enough to own a user id, and the user id is
 * all a sign-in ticket needs.
 *
 * This is also why the suite does not use `clerk.signIn({ emailAddress })`,
 * the helper Clerk's own docs lead with: it resolves the user *by email*, and
 * this instance's users either have no email or have one that belongs to a
 * real person rather than to a test.
 *
 * Creation is idempotent — an existing identity is reused, which keeps its
 * threads between runs and leaves a failed run's data available to inspect.
 */

import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/nextjs/server";
import { expect, test as setup, type Page } from "@playwright/test";
import { STORAGE_STATE } from "../../playwright.config";
import { releaseLiveStreams, rememberTestUserId } from "./helpers/stream-slot";
import { ROUTES } from "@/lib/routes";

setup.describe.configure({ mode: "serial" });

/**
 * A required variable, read as a value rather than asserted into one.
 *
 * `process.env` is `string | undefined` under `noUncheckedIndexedAccess`, and
 * C1 bans the non-null assertion that would flatten it. The throw is not
 * defensive padding: a missing key here produces a Clerk error about a
 * malformed token several seconds later, and this turns that into the name of
 * the variable to set.
 */
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(
      `${name} is not set. The E2E suite needs a Clerk *development* instance; ` +
        `see docs/runbook.md, "Running the E2E suite".`,
    );
  }
  return value;
}

/**
 * The test identity, addressed by username because it cannot be addressed by
 * email. Override to point the suite at an account that already exists.
 */
const TEST_USERNAME = process.env["E2E_CLERK_USERNAME"] ?? "aichatwave_e2e";

/** Long enough to outlast the suite, short enough not to linger. */
const TICKET_TTL_SECONDS = 60 * 30;

setup("global setup", async ({ page, baseURL }) => {
  const publishableKey = required("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const secretKey = required("CLERK_SECRET_KEY");

  // Throws on a production secret key, which is the guard we want: a suite
  // that signs itself into the live instance and starts deleting threads is
  // the worst thing in this directory.
  await clerkSetup({ publishableKey, secretKey });

  await assertServerAgreesOnItsOrigin(page, baseURL);

  const client = createClerkClient({ secretKey });
  const userId = await ensureTestUser(client);
  const { token } = await client.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: TICKET_TTL_SECONDS,
  });

  // Clerk must be loaded before the helper runs, and it only loads on a page
  // that renders the provider. The landing page is public, so this costs no
  // redirect.
  await page.goto(ROUTES.home);
  await clerk.loaded({ page });

  await clerk.signIn({ page, signInParams: { strategy: "ticket", ticket: token } });

  rememberTestUserId(userId);
  await releaseLiveStreams(userId);
  await settleOnboarding(page);

  // Proves the session is real against a route that `proxy.ts` protects,
  // rather than trusting that the helper returned without throwing.
  await page.goto(ROUTES.app);
  await expect(page.getByRole("navigation", { name: "Conversations" })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});

/**
 * Records a memory-consent decision so the first-run dialog does not open.
 *
 * `OnboardingDialog` is gated on the consent state being `undecided`, which is
 * exactly what a freshly-created test identity is. It is a modal, so it covers
 * the composer, and every chat and accessibility spec fails against a page
 * whose only visible controls are "Next" and "Turn memory on". That is the
 * product working: every new user meets this dialog. It is the suite that has
 * to account for it.
 *
 * Recorded through the API rather than by clicking, because the decision is
 * the payload — three clicks would assert the dialog's layout on the way to
 * every unrelated test, and the layout is not what those tests are about. The
 * dialog's own behaviour is covered by the accessibility specs, which meet it
 * on a route where it does not block them.
 *
 * `declined` and not `granted`: memory extraction would write facts during the
 * chat specs and make their assertions depend on what a model chose to
 * remember. ADR-0008's consent model is unaffected either way — a decision was
 * made and recorded, which is all the dialog was waiting for.
 */
async function settleOnboarding(page: Page): Promise<void> {
  const response = await page.request.put("/api/memories/consent", {
    data: { decision: "declined" },
  });
  if (!response.ok()) {
    throw new Error(
      `Could not record the onboarding consent decision (${response.status()}). Every ` +
        `authenticated spec will fail behind the first-run dialog.`,
    );
  }
}

/**
 * Fails early, and legibly, when the build under test was made for a different
 * origin than the one it is being served from.
 *
 * Without this the symptom is a working browser session that the server
 * refuses — every protected route bounces to sign-in, the transcript is empty,
 * and the only log line blames mismatched Clerk keys, which is not the
 * problem. It cost an hour to diagnose once; it costs one request to detect.
 *
 * `robots.txt` is the probe because it prints `appUrl()` verbatim as its
 * `Host:` line, which is exactly the value `authorizedParties` is derived
 * from, and it is public so it needs no session to read.
 */
async function assertServerAgreesOnItsOrigin(
  page: Page,
  baseURL: string | undefined,
): Promise<void> {
  if (baseURL === undefined) return;

  const response = await page.request.get("/robots.txt");
  const host = /^Host:\s*(.+)$/m.exec(await response.text())?.[1]?.trim();
  if (host === undefined) return;

  const expected = new URL(baseURL).origin;
  if (new URL(host).origin === expected) return;

  throw new Error(
    `The server under test believes it is served from ${host}, but the suite is driving ` +
      `${expected}.\n\n` +
      `Clerk will reject every session server-side and every protected route will bounce to ` +
      `sign-in. NEXT_PUBLIC_APP_URL is inlined at build time, so this cannot be fixed by ` +
      `restarting the server — rebuild:\n\n` +
      `  NEXT_PUBLIC_APP_URL=${expected} pnpm build\n\n` +
      `\`pnpm test:e2e\` does this for you; see docs/runbook.md, "Running the E2E suite".`,
  );
}

/** Returns the test identity's user id, creating it if the instance lacks it. */
async function ensureTestUser(client: ReturnType<typeof createClerkClient>): Promise<string> {
  const existing = await client.users.getUserList({ username: [TEST_USERNAME] });
  const found = existing.data[0];
  if (found !== undefined) return found.id;

  const created = await client.users.createUser({
    username: TEST_USERNAME,
    firstName: "AIChatWave",
    lastName: "E2E",
    // No password to skip: this identity is only ever reached by ticket.
    skipPasswordRequirement: true,
  });
  return created.id;
}
