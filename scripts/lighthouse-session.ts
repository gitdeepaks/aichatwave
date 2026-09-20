/**
 * Turns the Playwright storage state into a `Cookie` header Lighthouse can
 * send, so the authenticated routes get audited too.
 *
 * Lighthouse drives a bare Chrome with no notion of a Clerk session. The
 * Playwright setup project has already produced one and written it to disk, so
 * rather than teaching Lighthouse to sign in — which would mean a second
 * implementation of the ticket flow, and a second thing to break — this
 * re-uses the session that already exists.
 *
 * Prints a JSON object on stdout and nothing else, so a shell can capture it:
 *
 *   LHCI_EXTRA_HEADERS="$(pnpm --silent lighthouse:session)" pnpm lighthouse
 *
 * Exits non-zero when there is no session, which is the right answer for CI:
 * silently auditing only the public routes would let the authenticated ones
 * rot behind a green check. `--allow-missing` opts into that for a laptop that
 * has not run the E2E setup.
 *
 * Usage: pnpm lighthouse:session [--allow-missing]
 */

import { readFileSync } from "node:fs";
import * as z from "zod";

/** The subset of Playwright's storage state this needs, parsed rather than trusted. */
const storageStateSchema = z.object({
  cookies: z.array(
    z.object({
      name: z.string().min(1),
      value: z.string(),
      domain: z.string(),
      path: z.string(),
    }),
  ),
});

const STORAGE_STATE_PATH = "tests/e2e/.auth/user.json";

function main(): void {
  const allowMissing = process.argv.includes("--allow-missing");

  let raw: string;
  try {
    raw = readFileSync(STORAGE_STATE_PATH, "utf8");
  } catch {
    fail(
      `No signed-in session at ${STORAGE_STATE_PATH}. Run \`pnpm test:e2e\` first — its setup ` +
        `project writes that file.`,
      allowMissing,
    );
    return;
  }

  const parsed = storageStateSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    fail(`${STORAGE_STATE_PATH} is not a Playwright storage state.`, allowMissing);
    return;
  }

  // Every cookie in the file, not only the Clerk ones. A session cookie this
  // script decided was irrelevant is a 302 Lighthouse reports as a redirect
  // loop, and the file only ever contains this suite's own test identity.
  const cookie = parsed.data.cookies.map((entry) => `${entry.name}=${entry.value}`).join("; ");

  if (cookie.length === 0) {
    fail("The storage state holds no cookies; the session was never established.", allowMissing);
    return;
  }

  process.stdout.write(JSON.stringify({ Cookie: cookie }));
}

/** Prints to stderr so stdout stays a clean JSON document for the shell. */
function fail(message: string, allowMissing: boolean): void {
  if (allowMissing) {
    process.stderr.write(`${message}\nContinuing with public routes only.\n`);
    return;
  }
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

main();
