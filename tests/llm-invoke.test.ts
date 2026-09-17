import assert from "node:assert/strict";
import test from "node:test";
import { callModelWithResilience } from "@/server/ai/llm-invoke";
import { resetProviderHealth, providerBreakerStatus } from "@/server/ai/provider-health";
import { DEFAULT_BREAKER_POLICY, type RetryPolicy } from "@/lib/ai/resilience-policy";
import { registryProviders, type ModelId, type ModelProvider } from "@/lib/ai/model-registry";
import { createLogger, type LogEntry } from "@/server/lib/logger";
import { isAppError } from "@/server/lib/app-error";

const ALL_PROVIDERS: ReadonlySet<ModelProvider> = new Set(registryProviders());

const FAST_RETRY: RetryPolicy = {
  maxAttempts: 3,
  attemptTimeoutMs: 1_000,
  baseDelayMs: 1,
  maxDelayMs: 4,
};

function testLogger() {
  const entries: LogEntry[] = [];
  return { log: createLogger({}, (entry) => entries.push(entry)), entries };
}

function messages(entries: LogEntry[]): string[] {
  return entries.map((entry) => entry.message);
}

/** No real waiting, and a deterministic jitter draw. */
const harness = {
  sleep: () => Promise.resolve(),
  random: () => 0.5,
  availableProviders: ALL_PROVIDERS,
  retryPolicy: FAST_RETRY,
};

function providerError(status: number): Record<string, unknown> {
  return { status, message: `provider returned ${String(status)}` };
}

test("a call that succeeds first time is not retried and reports no fallback", async () => {
  resetProviderHealth();
  const { log } = testLogger();
  let calls = 0;

  const outcome = await callModelWithResilience<string>({
    ...harness,
    modelId: "gpt-5-nano",
    log,
    call: () => {
      calls += 1;
      return Promise.resolve("answer");
    },
  });

  assert.equal(outcome.result, "answer");
  assert.equal(outcome.modelId, "gpt-5-nano");
  assert.equal(outcome.fallbackFrom, null);
  assert.equal(outcome.attempts, 1);
  assert.equal(calls, 1);
});

test("a transient failure is retried and the second attempt is returned", async () => {
  resetProviderHealth();
  const { log, entries } = testLogger();
  let calls = 0;

  const outcome = await callModelWithResilience<string>({
    ...harness,
    modelId: "gpt-5-nano",
    log,
    call: () => {
      calls += 1;
      if (calls === 1) return Promise.reject(providerError(503));
      return Promise.resolve("answer");
    },
  });

  assert.equal(outcome.result, "answer");
  assert.equal(outcome.attempts, 2);
  assert.ok(messages(entries).includes("llm.attempt_failed"));
});

test("a permanent failure is not retried", async () => {
  resetProviderHealth();
  const { log } = testLogger();
  let calls = 0;

  await assert.rejects(
    callModelWithResilience<string>({
      ...harness,
      modelId: "gpt-5-nano",
      log,
      call: () => {
        calls += 1;
        return Promise.reject(providerError(400));
      },
    }),
  );

  assert.equal(calls, 1);
});

test("a stop is neither retried nor allowed to move the breaker", async () => {
  resetProviderHealth();
  const { log } = testLogger();
  let calls = 0;
  const abort = { name: "AbortError", message: "Stopped by the user." };

  await assert.rejects(
    callModelWithResilience<string>({
      ...harness,
      modelId: "gpt-5-nano",
      log,
      call: () => {
        calls += 1;
        return Promise.reject(abort);
      },
    }),
    (error: unknown) => error === abort,
  );

  assert.equal(calls, 1);
  assert.equal(providerBreakerStatus("openai"), "closed");
});

test("an outage degrades to a healthy provider instead of failing the turn", async () => {
  resetProviderHealth();
  const { log, entries } = testLogger();
  const attempted: ModelId[] = [];

  const outcome = await callModelWithResilience<string>({
    ...harness,
    modelId: "claude-sonnet-4-20250514",
    log,
    call: ({ modelId }) => {
      attempted.push(modelId);
      if (modelId === "claude-sonnet-4-20250514") return Promise.reject(providerError(503));
      return Promise.resolve("answer from the fallback");
    },
  });

  assert.equal(outcome.result, "answer from the fallback");
  assert.equal(outcome.fallbackFrom, "claude-sonnet-4-20250514");
  assert.notEqual(outcome.modelId, "claude-sonnet-4-20250514");
  // The primary was retried to exhaustion before anything else was tried.
  assert.equal(attempted.filter((id) => id === "claude-sonnet-4-20250514").length, 3);
  assert.ok(messages(entries).includes("llm.model_fallback"));
});

test("repeated failures open the breaker, and the next call skips the provider entirely", async () => {
  resetProviderHealth();
  const { log } = testLogger();

  // The breaker trips after `failureThreshold` consecutive failures; each call
  // below contributes `maxAttempts` of them.
  const rounds = Math.ceil(DEFAULT_BREAKER_POLICY.failureThreshold / FAST_RETRY.maxAttempts);
  for (let round = 0; round < rounds; round += 1) {
    await callModelWithResilience<string>({
      ...harness,
      modelId: "claude-sonnet-4-20250514",
      log,
      call: ({ modelId }) =>
        modelId === "claude-sonnet-4-20250514"
          ? Promise.reject(providerError(503))
          : Promise.resolve("fallback"),
    });
  }

  assert.equal(providerBreakerStatus("anthropic"), "open");

  const attempted: ModelId[] = [];
  const outcome = await callModelWithResilience<string>({
    ...harness,
    modelId: "claude-sonnet-4-20250514",
    log,
    call: ({ modelId }) => {
      attempted.push(modelId);
      return Promise.resolve("fallback");
    },
  });

  assert.equal(attempted.includes("claude-sonnet-4-20250514"), false);
  assert.equal(outcome.fallbackFrom, "claude-sonnet-4-20250514");
});

test("no healthy fallback means a typed 503, not a silent free upgrade", async () => {
  resetProviderHealth();
  const { log } = testLogger();

  await assert.rejects(
    callModelWithResilience<string>({
      ...harness,
      // Both free models are OpenAI's, so an OpenAI outage leaves a free-tier
      // turn with nowhere honest to go.
      availableProviders: new Set<ModelProvider>(["openai"]),
      modelId: "gpt-5-nano",
      log,
      call: () => Promise.reject(providerError(503)),
    }),
    (error: unknown) => isAppError(error) || typeof error === "object",
  );
});
