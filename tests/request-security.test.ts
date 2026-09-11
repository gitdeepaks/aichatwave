import assert from "node:assert/strict";
import test from "node:test";
import { clientIpFromHeaders } from "@/server/security/client-ip";
import { assertSameOrigin, isMutatingMethod } from "@/server/security/origin";
import { isAppError } from "@/server/lib/app-error";

const APP_ORIGIN = "https://aichatwave.in";

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

test("the platform header wins over the client-appendable one", () => {
  const ip = clientIpFromHeaders(
    headers({
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "198.51.100.1",
    }),
  );

  assert.equal(ip, "203.0.113.7");
});

test("only the first hop of x-forwarded-for is read", () => {
  // A client can append entries to this header; it cannot rewrite the first,
  // which is the one the edge recorded.
  assert.equal(
    clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" })),
    "203.0.113.7",
  );
});

test("a forged header that is not an IP is ignored, not trusted", () => {
  assert.equal(clientIpFromHeaders(headers({ "x-forwarded-for": "not-an-ip" })), null);
  assert.equal(clientIpFromHeaders(headers({ "x-forwarded-for": "" })), null);
});

test("IPv6 is recognised, bracketed or bare", () => {
  assert.equal(clientIpFromHeaders(headers({ "x-real-ip": "2001:db8::1" })), "2001:db8::1");
  assert.equal(clientIpFromHeaders(headers({ "x-real-ip": "[2001:db8::1]:443" })), "2001:db8::1");
});

test("an IPv4 source port is stripped", () => {
  assert.equal(clientIpFromHeaders(headers({ "x-real-ip": "203.0.113.7:54321" })), "203.0.113.7");
});

test("no forwarding header at all means no IP, not a shared placeholder", () => {
  // A placeholder would put every unproxied request in one bucket and
  // rate-limit local development against itself.
  assert.equal(clientIpFromHeaders(headers({})), null);
});

test("safe methods are never origin-checked", () => {
  assert.equal(isMutatingMethod("GET"), false);
  assert.equal(isMutatingMethod("head"), false);
  assert.equal(isMutatingMethod("OPTIONS"), false);
  assert.equal(isMutatingMethod("POST"), true);
  assert.equal(isMutatingMethod("DELETE"), true);
});

test("a write from another site is refused", () => {
  assert.throws(
    () =>
      assertSameOrigin({
        method: "POST",
        headers: headers({ origin: "https://evil.example", host: "aichatwave.in" }),
        appOrigin: APP_ORIGIN,
      }),
    (error: unknown) => isAppError(error) && error.code === "FORBIDDEN",
  );
});

test("a write from this deployment's own host is allowed", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin({
      method: "POST",
      headers: headers({ origin: "https://aichatwave.in", host: "aichatwave.in" }),
      appOrigin: APP_ORIGIN,
    }),
  );
});

test("a preview deployment is allowed via its own forwarded host", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin({
      method: "POST",
      headers: headers({
        origin: "https://preview-abc.vercel.app",
        "x-forwarded-host": "preview-abc.vercel.app",
        host: "internal-router",
      }),
      appOrigin: APP_ORIGIN,
    }),
  );
});

test("schemes may differ between the browser's origin and a proxied host header", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin({
      method: "POST",
      headers: headers({ origin: "https://aichatwave.in", host: "aichatwave.in" }),
      appOrigin: "http://aichatwave.in",
    }),
  );
});

test("a client that sends no origin is allowed through", () => {
  // curl, a health checker, a server-to-server call. None carry ambient
  // cookies, so requiring the header would break honest clients and close
  // nothing.
  for (const testHeaders of [headers({ host: "aichatwave.in" }), headers({ origin: "null" })]) {
    assert.doesNotThrow(() =>
      assertSameOrigin({ method: "POST", headers: testHeaders, appOrigin: APP_ORIGIN }),
    );
  }
});

test("a cross-origin GET is still allowed", () => {
  assert.doesNotThrow(() =>
    assertSameOrigin({
      method: "GET",
      headers: headers({ origin: "https://evil.example", host: "aichatwave.in" }),
      appOrigin: APP_ORIGIN,
    }),
  );
});
