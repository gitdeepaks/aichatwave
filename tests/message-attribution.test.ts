import assert from "node:assert/strict";
import test from "node:test";
import { formatCostUsd, formatTokenCount, readAttribution } from "@/lib/chat/ui-message";
import { messageCostUsd } from "@/lib/ai/model-registry";

test("a message with no model has no attribution to show", () => {
  assert.equal(readAttribution(undefined), null);
  assert.equal(readAttribution({}), null);
  assert.equal(readAttribution({ modelId: null }), null);
});

/**
 * An aborted turn can report a model but no usage. Attributing the model and
 * reporting zero is the true state; suppressing the line entirely would hide
 * which model was stopped.
 */
test("a model without usage still attributes, at zero", () => {
  const attribution = readAttribution({ modelId: "gpt-5-nano" });

  assert.equal(attribution?.modelId, "gpt-5-nano");
  assert.equal(attribution?.totalTokens, 0);
  assert.equal(attribution?.costUsd, 0);
});

test("cost is computed from list price and the provider's own token counts", () => {
  const attribution = readAttribution({
    modelId: "gpt-5-mini",
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  });

  // 0.25 in + 2.00 out per million.
  assert.equal(attribution?.costUsd, 2.25);
  assert.equal(attribution?.totalTokens, 2_000_000);
});

test("a message with no model has no cost, rather than a confident zero", () => {
  assert.equal(messageCostUsd({ modelId: null, inputTokens: 10, outputTokens: 10 }), null);
});

test("a cheap turn is not rounded away to nothing", () => {
  assert.equal(formatCostUsd(0), "$0");
  assert.equal(formatCostUsd(0.00023), "$0.0002");
  assert.equal(formatCostUsd(1.239), "$1.24");
});

test("token counts stay readable at every magnitude", () => {
  assert.equal(formatTokenCount(0), "0");
  assert.equal(formatTokenCount(999), "999");
  assert.equal(formatTokenCount(1500), "1.5k");
  assert.equal(formatTokenCount(1_200_000), "1200k");
});
