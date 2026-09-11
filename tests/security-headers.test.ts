import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
  generateNonce,
  type SecurityHeaderOptions,
} from "@/lib/security/security-headers";

const PRODUCTION: SecurityHeaderOptions = {
  nonce: "dGVzdC1ub25jZS0xMjM0",
  isDevelopment: false,
  isSecure: true,
  reportOnly: false,
};

function directive(policy: string, name: string): string {
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));

  assert.ok(found !== undefined, `expected a "${name}" directive in: ${policy}`);
  return found;
}

function headerValue(options: SecurityHeaderOptions, name: string): string | undefined {
  return buildSecurityHeaders(options).find(([header]) => header === name)?.[1];
}

test("script-src carries the nonce and strict-dynamic, and never unsafe-inline", () => {
  const scriptSrc = directive(buildContentSecurityPolicy(PRODUCTION), "script-src");

  assert.ok(scriptSrc.includes(`'nonce-${PRODUCTION.nonce}'`));
  assert.ok(scriptSrc.includes("'strict-dynamic'"));
  assert.ok(!scriptSrc.includes("'unsafe-inline'"));
  assert.ok(!scriptSrc.includes("'unsafe-eval'"));
});

test("unsafe-eval is a development-only concession", () => {
  const development = buildContentSecurityPolicy({ ...PRODUCTION, isDevelopment: true });

  assert.ok(directive(development, "script-src").includes("'unsafe-eval'"));
  assert.ok(directive(development, "connect-src").includes("wss:"));
});

test("style-src keeps unsafe-inline and therefore must carry no nonce", () => {
  // A nonce in the same directive makes browsers ignore 'unsafe-inline', which
  // would silently break every Shiki-highlighted code block.
  const styleSrc = directive(buildContentSecurityPolicy(PRODUCTION), "style-src");

  assert.ok(styleSrc.includes("'unsafe-inline'"));
  assert.ok(!styleSrc.includes("nonce-"));
});

test("the page cannot be framed, and says so twice for old browsers", () => {
  assert.equal(
    directive(buildContentSecurityPolicy(PRODUCTION), "frame-ancestors"),
    "frame-ancestors 'none'",
  );
  assert.equal(headerValue(PRODUCTION, "x-frame-options"), "DENY");
});

test("object-src and base-uri are locked down", () => {
  const policy = buildContentSecurityPolicy(PRODUCTION);

  assert.equal(directive(policy, "object-src"), "object-src 'none'");
  assert.equal(directive(policy, "base-uri"), "base-uri 'self'");
});

test("HSTS is sent over TLS and withheld over plain HTTP", () => {
  assert.equal(
    headerValue(PRODUCTION, "strict-transport-security"),
    "max-age=63072000; includeSubDomains; preload",
  );
  assert.equal(
    headerValue({ ...PRODUCTION, isSecure: false }, "strict-transport-security"),
    undefined,
  );
});

test("upgrade-insecure-requests follows the same TLS rule", () => {
  assert.ok(buildContentSecurityPolicy(PRODUCTION).includes("upgrade-insecure-requests"));
  assert.ok(
    !buildContentSecurityPolicy({ ...PRODUCTION, isSecure: false }).includes(
      "upgrade-insecure-requests",
    ),
  );
});

test("report-only swaps the header name and nothing else", () => {
  const enforced = headerValue(PRODUCTION, "content-security-policy");
  const reported = headerValue(
    { ...PRODUCTION, reportOnly: true },
    "content-security-policy-report-only",
  );

  assert.equal(reported, enforced);
  assert.equal(
    headerValue({ ...PRODUCTION, reportOnly: true }, "content-security-policy"),
    undefined,
  );
});

test("the microphone is allowed for this origin and every other feature is denied", () => {
  const permissions = headerValue(PRODUCTION, "permissions-policy");

  assert.ok(permissions !== undefined);
  // The composer's speech-input button needs it.
  assert.ok(permissions.includes("microphone=(self)"));
  assert.ok(permissions.includes("camera=()"));
  assert.ok(permissions.includes("geolocation=()"));
  assert.ok(permissions.includes("payment=()"));
});

test("the baseline header set is always present", () => {
  for (const name of [
    "content-security-policy",
    "x-content-type-options",
    "referrer-policy",
    "x-frame-options",
    "permissions-policy",
    "cross-origin-opener-policy",
  ]) {
    assert.ok(headerValue(PRODUCTION, name) !== undefined, `missing ${name}`);
  }
});

test("nonces are base64 and do not repeat", () => {
  const nonces = new Set(Array.from({ length: 64 }, () => generateNonce()));

  assert.equal(nonces.size, 64);
  for (const nonce of nonces) {
    assert.match(nonce, /^[A-Za-z0-9+/]+={0,2}$/u);
  }
});
