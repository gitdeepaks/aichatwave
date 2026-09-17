import assert from "node:assert/strict";
import test from "node:test";
import { classifyProviderFailure } from "@/server/ai/provider-failure";

test("an OpenAI-style 429 is a rate limit", () => {
  assert.equal(
    classifyProviderFailure({ status: 429, message: "Rate limit reached" }),
    "rate_limited",
  );
});

test("a 429 for an exhausted account is permanent, not a rate limit", () => {
  assert.equal(
    classifyProviderFailure({ status: 429, code: "insufficient_quota", message: "quota" }),
    "permanent",
  );
  assert.equal(
    classifyProviderFailure({
      status: 429,
      message: "You exceeded your current quota, please check your plan and billing details.",
    }),
    "permanent",
  );
});

test("a 5xx is an upstream outage and a 4xx is not", () => {
  assert.equal(classifyProviderFailure({ status: 503 }), "upstream_unavailable");
  assert.equal(classifyProviderFailure({ status: 500 }), "upstream_unavailable");
  assert.equal(classifyProviderFailure({ status: 401 }), "permanent");
  assert.equal(classifyProviderFailure({ status: 400 }), "permanent");
});

test("Google's status-in-the-message format is read", () => {
  assert.equal(
    classifyProviderFailure({
      message: "[GoogleGenerativeAI Error]: fetch failed [503 Service Unavailable]",
    }),
    "upstream_unavailable",
  );
});

test("a cancelled call is an abort, however deep it is wrapped", () => {
  const abort = { name: "AbortError", message: "This operation was aborted" };
  assert.equal(classifyProviderFailure(abort), "aborted");
  assert.equal(classifyProviderFailure({ name: "Error", cause: abort }), "aborted");
  assert.equal(classifyProviderFailure({ name: "APIUserAbortError" }), "aborted");
});

test("an abort is not mistaken for an outage even when it reports a status", () => {
  assert.equal(classifyProviderFailure({ name: "AbortError", status: 500 }), "aborted");
});

test("timeouts are recognised by name, code, and message", () => {
  assert.equal(classifyProviderFailure({ name: "TimeoutError" }), "timeout");
  assert.equal(classifyProviderFailure({ code: "ETIMEDOUT" }), "timeout");
  assert.equal(classifyProviderFailure({ message: "Request timed out." }), "timeout");
});

test("socket failures are upstream outages, including through undici's cause", () => {
  assert.equal(classifyProviderFailure({ code: "ECONNRESET" }), "upstream_unavailable");
  assert.equal(
    classifyProviderFailure({ name: "TypeError", message: "fetch failed" }),
    "upstream_unavailable",
  );
  assert.equal(
    classifyProviderFailure({ name: "TypeError", cause: { code: "ECONNREFUSED" } }),
    "upstream_unavailable",
  );
});

test("an unrecognised failure is permanent rather than retried on a guess", () => {
  assert.equal(classifyProviderFailure(new Error("something odd")), "permanent");
  assert.equal(classifyProviderFailure("a string"), "permanent");
  assert.equal(classifyProviderFailure(null), "permanent");
});
