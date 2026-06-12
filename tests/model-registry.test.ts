import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_MODEL_ID,
  getEffectiveModelId,
  getModelConfig,
  isModelAccessible,
  isModelId,
  MODEL_REGISTRY,
} from "@/lib/ai/model-registry";

test("isModelId accepts registry ids and rejects everything else", () => {
  for (const id of Object.keys(MODEL_REGISTRY)) {
    assert.equal(isModelId(id), true);
  }
  assert.equal(isModelId("gpt-99-ultra"), false);
  assert.equal(isModelId(undefined), false);
  assert.equal(isModelId(42), false);
});

test("getEffectiveModelId falls back to the default model", () => {
  assert.equal(getEffectiveModelId("gpt-5-mini"), "gpt-5-mini");
  assert.equal(getEffectiveModelId("not-a-model"), DEFAULT_MODEL_ID);
  assert.equal(getEffectiveModelId(undefined), DEFAULT_MODEL_ID);
});

test("free models are accessible without a subscription", () => {
  assert.equal(isModelAccessible("gpt-5-mini", false), true);
  assert.equal(isModelAccessible("gpt-5-nano", false), true);
});

test("subscription models require an active subscription", () => {
  assert.equal(isModelAccessible("gemini-3.1-pro", false), false);
  assert.equal(isModelAccessible("claude-sonnet-4-20250514", false), false);
  assert.equal(isModelAccessible("gemini-3.1-pro", true), true);
  assert.equal(isModelAccessible("claude-sonnet-4-20250514", true), true);
});

test("the default model is on the free tier", () => {
  assert.equal(getModelConfig(DEFAULT_MODEL_ID).tier, "free");
});
