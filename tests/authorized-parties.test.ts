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
