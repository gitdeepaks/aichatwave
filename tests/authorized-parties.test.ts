import assert from "node:assert/strict";
import test from "node:test";
import { resolveAuthorizedParties } from "@/lib/security/authorized-parties";

test("an unconfigured deployment authorizes nothing, so Clerk skips the check", () => {
  // Empty is the only safe "I don't know": Clerk treats it as "no restriction",
  // where a partial list would be enforced and reject real users.
  assert.deepEqual(resolveAuthorizedParties({}), []);
});

test("the custom domain comes from VERCEL_PROJECT_PRODUCTION_URL, not VERCEL_URL", () => {
  // The regression this exists for: listing only VERCEL_URL produces a
  // non-empty list that rejects every user arriving on the real domain.
  const parties = resolveAuthorizedParties({
    VERCEL_URL: "aichatwave-abc123.vercel.app",
    VERCEL_PROJECT_PRODUCTION_URL: "www.aichatwave.in",
  });

  assert.ok(parties.includes("https://www.aichatwave.in"));
  assert.ok(parties.includes("https://aichatwave-abc123.vercel.app"));
});

test("a configured app URL is taken as-is, including its scheme", () => {
  assert.deepEqual(resolveAuthorizedParties({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }), [
    "http://localhost:3000",
  ]);
});

test("development also authorizes the origin serving the current request", () => {
  assert.deepEqual(
    resolveAuthorizedParties(
      {
        NODE_ENV: "development",
        NEXT_PUBLIC_APP_URL: "https://www.aichatwave.in",
      },
      "http://localhost:3000",
    ),
    ["https://www.aichatwave.in", "http://localhost:3000"],
  );
});

test("production never trusts an origin derived from the request", () => {
  assert.deepEqual(
    resolveAuthorizedParties(
      {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://www.aichatwave.in",
      },
      "https://attacker.example",
    ),
    ["https://www.aichatwave.in"],
  );
});

test("trailing slashes are trimmed, because azp never carries one", () => {
  assert.deepEqual(
    resolveAuthorizedParties({ NEXT_PUBLIC_APP_URL: "https://www.aichatwave.in/" }),
    ["https://www.aichatwave.in"],
  );
});

test("the same origin reached two ways is listed once", () => {
  const parties = resolveAuthorizedParties({
    NEXT_PUBLIC_APP_URL: "https://www.aichatwave.in",
    VERCEL_PROJECT_PRODUCTION_URL: "www.aichatwave.in",
  });

  assert.deepEqual(parties, ["https://www.aichatwave.in"]);
});

test("empty strings are treated as unset, not as an origin", () => {
  assert.deepEqual(resolveAuthorizedParties({ NEXT_PUBLIC_APP_URL: "", VERCEL_URL: "" }), []);
});

test("preview deployments authorize their branch URL too", () => {
  const parties = resolveAuthorizedParties({
    VERCEL_URL: "aichatwave-abc123.vercel.app",
    VERCEL_BRANCH_URL: "aichatwave-git-feature.vercel.app",
  });

  assert.equal(parties.length, 2);
  assert.ok(parties.includes("https://aichatwave-git-feature.vercel.app"));
});

/**
 * The regression that motivated normalizing through `URL`.
 *
 * `http:localhost:3000` is a one-character typo — a missing `/` — and it
 * passes `z.url()` in `lib/env.ts` because the WHATWG parser accepts it. Every
 * other consumer of the variable therefore behaves correctly, which is what
 * made this so hard to see: the list went out verbatim, Clerk compared it
 * against the browser's parsed `azp` of `http://localhost:3000`, and rejected
 * every session. `auth()` saw no user while the browser held a valid one.
 */
test("a malformed but parseable app URL still yields the origin Clerk compares", () => {
  assert.deepEqual(resolveAuthorizedParties({ NEXT_PUBLIC_APP_URL: "http:localhost:3000" }), [
    "http://localhost:3000",
  ]);
  assert.deepEqual(resolveAuthorizedParties({ NEXT_PUBLIC_APP_URL: "https:www.aichatwave.in" }), [
    "https://www.aichatwave.in",
  ]);
});

test("a path on the configured URL is dropped, because azp is an origin", () => {
  assert.deepEqual(
    resolveAuthorizedParties({ NEXT_PUBLIC_APP_URL: "https://www.aichatwave.in/app" }),
    ["https://www.aichatwave.in"],
  );
});

test("an unparseable value is dropped rather than listed", () => {
  // The danger of keeping it is not that it matches something it should not —
  // it is that it makes the list non-empty, and a non-empty list is enforcing.
  assert.deepEqual(resolveAuthorizedParties({ NEXT_PUBLIC_APP_URL: "not a url" }), []);
});

test("two spellings of one origin still collapse to a single entry", () => {
  assert.deepEqual(
    resolveAuthorizedParties({
      NEXT_PUBLIC_APP_URL: "https://www.aichatwave.in/",
      VERCEL_PROJECT_PRODUCTION_URL: "www.aichatwave.in",
    }),
    ["https://www.aichatwave.in"],
  );
});

test("the default port is normalized away, as it is in an azp claim", () => {
  assert.deepEqual(resolveAuthorizedParties({ NEXT_PUBLIC_APP_URL: "https://example.com:443" }), [
    "https://example.com",
  ]);
});
