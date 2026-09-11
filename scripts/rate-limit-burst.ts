/**
 * Phase D exit criterion 1: a scripted burst of 100 messages from one account
 * returns 429s with `Retry-After`.
 *
 * Sends the burst against a running deployment and reports what came back per
 * status code, so the criterion is checked rather than asserted. Unit tests
 * cover the window arithmetic; this covers the thing they cannot — that the
 * SQL, the route, and the headers agree once they are wired together.
 *
 * Usage:
 *
 *   BURST_BASE_URL=http://localhost:3000 \
 *   BURST_COOKIE='__session=...' \
 *   node --env-file-if-exists=.env --import tsx scripts/rate-limit-burst.ts
 *
 * `BURST_COOKIE` is the `Cookie` header from a signed-in browser session —
 * copy it out of DevTools. Without it every request is a 401 and the run tells
 * you nothing about the limiter. There is deliberately no way to mint a session
 * from this script: doing so would mean shipping a code path that forges one.
 */

import { randomUUID } from "node:crypto";

const BASE_URL = (process.env["BURST_BASE_URL"] ?? "http://localhost:3000").replace(/\/+$/, "");
const COOKIE = process.env["BURST_COOKIE"] ?? "";
const COUNT = Number(process.env["BURST_COUNT"] ?? "100");
/** One thread, so the burst also exercises the concurrent-stream cap. */
const THREAD_ID = process.env["BURST_THREAD_ID"] ?? randomUUID();

type Outcome = {
  status: number;
  code: string | null;
  retryAfter: string | null;
};

async function sendOne(index: number): Promise<Outcome> {
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: BASE_URL,
      ...(COOKIE.length > 0 ? { cookie: COOKIE } : {}),
    },
    body: JSON.stringify({
      threadId: THREAD_ID,
      messageContent: `burst probe ${index}`,
      selectedModel: "gpt-5-nano",
    }),
  });

  const retryAfter = response.headers.get("retry-after");

  if (response.ok) {
    // Drain and drop: reading the stream is what releases the stream lease, so
    // a probe that leaves bodies open would measure the cap rather than the
    // sliding window.
    await response.body?.cancel();
    return { status: response.status, code: null, retryAfter };
  }

  const text = await response.text();
  let code: string | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
      const envelope: unknown = parsed.error;
      if (typeof envelope === "object" && envelope !== null && "code" in envelope) {
        const value: unknown = envelope.code;
        code = typeof value === "string" ? value : null;
      }
    }
  } catch {
    code = null;
  }

  return { status: response.status, code, retryAfter };
}

async function main(): Promise<void> {
  if (COOKIE.length === 0) {
    process.stdout.write(
      "warning: BURST_COOKIE is unset, so every request will be 401 and the limiter will not be reached.\n\n",
    );
  }

  process.stdout.write(`Sending ${COUNT} requests to ${BASE_URL}/api/chat …\n`);

  const outcomes = await Promise.all(
    Array.from({ length: COUNT }, (_unused, index) => sendOne(index)),
  );

  const tally = new Map<string, number>();
  let withRetryAfter = 0;
  let missingRetryAfter = 0;

  for (const outcome of outcomes) {
    const key = `${outcome.status} ${outcome.code ?? "-"}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);

    if (outcome.status === 429) {
      if (outcome.retryAfter === null) missingRetryAfter += 1;
      else withRetryAfter += 1;
    }
  }

  process.stdout.write("\nResults\n");
  for (const [key, count] of [...tally].sort()) {
    process.stdout.write(`  ${key.padEnd(28)} ${count}\n`);
  }

  const rejected = withRetryAfter + missingRetryAfter;
  process.stdout.write(`\n429s: ${rejected} (${withRetryAfter} carried Retry-After)\n`);

  const passed = rejected > 0 && missingRetryAfter === 0;
  process.stdout.write(
    passed
      ? "\nPASS — the burst was throttled and every 429 carried Retry-After.\n"
      : `\nFAIL — ${rejected === 0 ? "nothing was throttled" : `${missingRetryAfter} of ${rejected} 429s had no Retry-After`}.\n`,
  );

  process.exitCode = passed ? 0 : 1;
}

await main();
