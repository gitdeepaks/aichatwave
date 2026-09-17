import assert from "node:assert/strict";
import test from "node:test";
import { classifyIncident, type ErrorFacts } from "@/lib/observability/incident-policy";
import { errorFacts } from "@/server/observability/error-facts";
import { AppError } from "@/server/lib/app-error";

function facts(overrides: Partial<ErrorFacts> = {}): ErrorFacts {
  return { name: "Error", appErrorCode: null, status: null, aborted: false, ...overrides };
}

test("a 4xx is the API answering, not an incident", () => {
  for (const [code, status] of [
    ["UNAUTHORIZED", 401],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["INVALID_REQUEST", 400],
    ["QUOTA_EXCEEDED", 429],
  ] as const) {
    const decision = classifyIncident(facts({ appErrorCode: code, status }));
    assert.equal(decision.report, false, `${code} should not be reported`);
    if (!decision.report) assert.equal(decision.reason, "expected_client_error");
  }
});

test("a 5xx AppError is reported and grouped by its code", () => {
  const decision = classifyIncident(
    facts({ appErrorCode: "UPSTREAM_ERROR", status: 502, name: "AppError" }),
  );
  assert.equal(decision.report, true);
  if (decision.report) assert.equal(decision.groupingKey, "UPSTREAM_ERROR");
});

test("an untyped throw is reported and grouped by its class name", () => {
  const decision = classifyIncident(facts({ name: "TypeError" }));
  assert.equal(decision.report, true);
  if (decision.report) assert.equal(decision.groupingKey, "TypeError");
});

test("a cancellation is never an incident, whatever else it looks like", () => {
  const decision = classifyIncident(
    facts({ name: "AbortError", aborted: true, appErrorCode: "INTERNAL_ERROR", status: 500 }),
  );
  assert.equal(decision.report, false);
  if (!decision.report) assert.equal(decision.reason, "deliberate_abort");
});

test("errorFacts reads an AppError's code and status", () => {
  const read = errorFacts(new AppError("RATE_LIMITED", "Slow down.", { retryAfterSeconds: 12 }));
  assert.equal(read.appErrorCode, "RATE_LIMITED");
  assert.equal(read.status, 429);
  assert.equal(read.aborted, false);
});

test("errorFacts sees an abort through one level of wrapping", () => {
  const abort = new Error("The operation was aborted.");
  abort.name = "AbortError";
  const wrapped = new Error("Provider call failed", { cause: abort });

  assert.equal(errorFacts(abort).aborted, true);
  assert.equal(errorFacts(wrapped).aborted, true);
});

test("errorFacts survives a non-Error throw", () => {
  const read = errorFacts("something went wrong");
  assert.equal(read.name, "UnknownError");
  assert.equal(read.appErrorCode, null);
  assert.equal(classifyIncident(read).report, true);
});
