/**
 * The environment every integration and service test runs in.
 *
 * Importing this module — which must happen before anything that reaches
 * `@/lib/env`, because that module validates `process.env` as an import side
 * effect and throws — does three things:
 *
 *  1. fills in the environment `lib/env.ts` requires, with values that are
 *     obviously placeholders;
 *  2. points `DATABASE_URL` at a database unique to this process, so the
 *     file's tests get their own tables and two files can run at once;
 *  3. installs the stubs for the three edges a test cannot have: Clerk, Polar,
 *     and the Vercel runtime's `waitUntil`.
 *
 * Nothing else is stubbed. Route handlers, services, repositories, the error
 * envelope, the cross-origin guard and the rate limiter all run for real.
 */

import { randomBytes } from "node:crypto";
import { stubModule } from "./module-stub";

/**
 * Where to reach a Postgres that this process may create a database on.
 *
 * `docker compose up db` in this repository serves exactly this, and the CI
 * workflow's service container is configured to match, so the default is the
 * right answer in both places and `TEST_DATABASE_URL` is only needed for
 * anything else.
 */
export const adminDatabaseUrl =
  process.env["TEST_DATABASE_URL"] ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";

/**
 * One throwaway database per test *process*.
 *
 * `node --test` runs each file in its own child process, so this is one
 * database per file: no truncation races between files, and no ordering
 * dependency for the suite to grow one accidentally.
 *
 * A database rather than a schema because Drizzle generates its migrations
 * with `"public"."…"` written into every foreign key and enum. Applying them
 * anywhere else would mean rewriting the SQL under test, which is exactly the
 * thing these tests exist to check.
 */
export const testDatabaseName = `aichatwave_test_${process.pid}_${randomBytes(4).toString("hex")}`;

function databaseUrlFor(name: string): string {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

export const testDatabaseUrl = databaseUrlFor(testDatabaseName);

/** The origin the app believes it is served from, and so the only one it accepts writes from. */
export const TEST_APP_URL = "http://localhost:3000";

/** A Clerk user id in `ADMIN_USER_IDS`, for the `/api/admin/*` surfaces. */
export const TEST_ADMIN_USER_ID = "user_test_admin";

const PLACEHOLDER_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: testDatabaseUrl,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dGVzdC1wbGFjZWhvbGRlci5jbGVyay5hY2NvdW50cy5kZXYk",
  CLERK_SECRET_KEY: "sk_test_placeholder",
  OPENAI_API_KEY: "sk-test-placeholder",
  POLAR_ACCESS_TOKEN: "polar_oat_test_placeholder",
  POLAR_PRODUCT_ID: "00000000-0000-0000-0000-000000000000",
  NEXT_PUBLIC_APP_URL: TEST_APP_URL,
  ADMIN_USER_IDS: TEST_ADMIN_USER_ID,
  /**
   * Anthropic is configured and Google is not, deliberately.
   *
   * Both of this registry's subscription-tier models would otherwise be
   * indistinguishable in a test. With exactly one provider key missing, the
   * Anthropic model is *available but not included in the free plan* (403
   * `MODEL_ACCESS_DENIED`) and the Google one is *not configured on this
   * deployment at all* (503 `SERVICE_UNAVAILABLE`) — which is precisely the
   * ordering `streamChat` documents and nothing had ever checked.
   */
  ANTHROPIC_API_KEY: "sk-ant-test-placeholder",
};

/** Providers this deployment must *not* hold a key for. See the note above. */
for (const key of ["GOOGLE_API_KEY", "SERP_API_KEY"]) {
  delete process.env[key];
}

for (const [key, value] of Object.entries(PLACEHOLDER_ENV)) {
  process.env[key] = value;
}

/* ───────────────────────────── Clerk ───────────────────────────── */

type TestClerkUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  emailAddresses: { id: string; emailAddress: string }[];
  primaryEmailAddressId: string | null;
};

let session: TestClerkUser | null = null;

function buildClerkUser(userId: string, overrides: Partial<TestClerkUser> = {}) {
  const email = `${userId}@example.test`;
  const base: TestClerkUser = {
    id: userId,
    firstName: "Test",
    lastName: "User",
    fullName: "Test User",
    imageUrl: null,
    primaryEmailAddress: { emailAddress: email },
    emailAddresses: [{ id: `idn_${userId}`, emailAddress: email }],
    primaryEmailAddressId: `idn_${userId}`,
  };
  return { ...base, ...overrides };
}

/** Makes every subsequent request in this file act as `userId`. */
export function signInAs(userId: string, overrides: Partial<TestClerkUser> = {}): void {
  session = buildClerkUser(userId, overrides);
}

/** Makes every subsequent request anonymous, which is what produces `UNAUTHORIZED`. */
export function signOut(): void {
  session = null;
}

stubModule("@clerk/nextjs/server", {
  auth: () => Promise.resolve({ userId: session?.id ?? null }),
  currentUser: () => Promise.resolve(session),
  clerkClient: () =>
    Promise.resolve({
      users: { deleteUser: (userId: string) => Promise.resolve({ id: userId }) },
    }),
});

/* ─────────────────────── Vercel runtime ─────────────────────── */

/**
 * Outside a Vercel invocation there is no context for `waitUntil` to attach to,
 * so the work runs and its result is dropped — which is what the platform does
 * with it too: background work must not fail the response it ran behind.
 *
 * The `catch` is the part that matters. The plan reconcile, the rate-limit
 * sweep and memory extraction all run through here, and an unhandled rejection
 * from one of them would take the whole test process down rather than failing
 * the test that caused it.
 */
stubModule("@vercel/functions", {
  waitUntil: (promise: Promise<unknown>) => {
    void Promise.resolve(promise).catch(() => {});
  },
});

/* ───────────────────────── Structured log capture ───────────────────────── */

/**
 * Log lines the code under test emitted, instead of thousands of JSON objects
 * scrolling past a test run.
 *
 * The logger itself is *not* stubbed — every line is really formatted and
 * really written, it is just written here. That keeps the structured-logging
 * contract under test (a test can assert that `quota.exceeded` was logged with
 * the plan on it) and keeps the runner's output readable. Set `TEST_LOG=1` to
 * see them on the console as well, which is what you want when a test is
 * failing for a reason the assertions do not explain.
 */
type CapturedLogLine = {
  level?: string;
  message?: string;
  context?: Record<string, unknown>;
};

const logLines: CapturedLogLine[] = [];
const echoLogs = process.env["TEST_LOG"] === "1";

function capture(write: (line: string) => void) {
  return (...args: unknown[]): void => {
    const [first] = args;

    if (typeof first === "string") {
      try {
        const parsed: unknown = JSON.parse(first);
        if (typeof parsed === "object" && parsed !== null) {
          logLines.push(parsed);
        }
      } catch {
        /* not one of ours — drop it */
      }
    }

    if (echoLogs) write(args.map((arg) => String(arg)).join(" "));
  };
}

const writeOut = console.log.bind(console);
const writeErr = console.error.bind(console);

console.log = capture(writeOut);
console.warn = capture(writeErr);
console.error = capture(writeErr);

/** The first captured line with this `message`, or undefined. */
export function findLogLine(message: string): CapturedLogLine | undefined {
  return logLines.find((line) => line.message === message);
}

export function clearCapturedLogs(): void {
  logLines.length = 0;
}
