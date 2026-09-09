import assert from "node:assert/strict";
import test from "node:test";
import { NEXT_BUILD_PHASE, requiresRuntimeConfig } from "@/lib/env-policy";

test("runtime-only config is enforced when serving production traffic", () => {
  assert.equal(requiresRuntimeConfig({ nodeEnv: "production", nextPhase: undefined }), true);
});

test("runtime-only config is not enforced during `next build`", () => {
  // The build needs no billing credentials; requiring them there blocks deploys
  // without preventing a bad config from reaching users.
  assert.equal(
    requiresRuntimeConfig({ nodeEnv: "production", nextPhase: NEXT_BUILD_PHASE }),
    false,
  );
});

test("a production build still enforces config once it is actually serving", () => {
  // Same deployment, after the build: NEXT_PHASE is gone, so the guard returns.
  assert.equal(requiresRuntimeConfig({ nodeEnv: "production", nextPhase: "" }), true);
  assert.equal(
    requiresRuntimeConfig({ nodeEnv: "production", nextPhase: "phase-production-server" }),
    true,
  );
});

test("development and test are never subject to the production guard", () => {
  assert.equal(requiresRuntimeConfig({ nodeEnv: "development", nextPhase: undefined }), false);
  assert.equal(requiresRuntimeConfig({ nodeEnv: "test", nextPhase: undefined }), false);
});
