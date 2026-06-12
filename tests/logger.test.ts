import assert from "node:assert/strict";
import test from "node:test";
import { createLogger, serializeError, type LogEntry } from "@/server/lib/logger";

function collectingLogger() {
  const entries: LogEntry[] = [];
  const logger = createLogger({}, (entry) => entries.push(entry));
  return { logger, entries };
}

test("emits structured entries with level, message, and context", () => {
  const { logger, entries } = collectingLogger();

  logger.info("chat.stream_started", { requestId: "req-1", userId: "user-1" });

  assert.equal(entries.length, 1);
  const entry = entries[0];
  assert.ok(entry);
  assert.equal(entry.level, "info");
  assert.equal(entry.message, "chat.stream_started");
  assert.deepEqual(entry.context, { requestId: "req-1", userId: "user-1" });
  assert.ok(!Number.isNaN(Date.parse(entry.time)));
});

test("child loggers inherit and merge context", () => {
  const { logger, entries } = collectingLogger();

  const child = logger.child({ requestId: "req-2" }).child({ threadId: "thread-9" });
  child.warn("memory.read_failed", { userId: "user-2" });

  const entry = entries[0];
  assert.ok(entry);
  assert.deepEqual(entry.context, {
    requestId: "req-2",
    threadId: "thread-9",
    userId: "user-2",
  });
});

test("per-call context overrides inherited keys", () => {
  const { logger, entries } = collectingLogger();

  logger.child({ modelId: "gpt-5-nano" }).info("llm.call_completed", { modelId: "gpt-5-mini" });

  const entry = entries[0];
  assert.ok(entry);
  assert.equal(entry.context.modelId, "gpt-5-mini");
});

test("serializes Error causes and stringifies unknown causes", () => {
  const { logger, entries } = collectingLogger();

  logger.error("llm.call_failed", { requestId: "req-3" }, new TypeError("boom"));
  logger.error("tool.news_fetch_failed", {}, { weird: true });

  const [withError, withUnknown] = entries;
  assert.ok(withError?.error);
  assert.equal(withError.error.name, "TypeError");
  assert.equal(withError.error.message, "boom");

  assert.ok(withUnknown?.error);
  assert.equal(withUnknown.error.name, "UnknownError");
  assert.equal(withUnknown.error.message, '{"weird":true}');
});

test("serializeError handles circular values without throwing", () => {
  type Circular = { self?: unknown };
  const circular: Circular = {};
  circular.self = circular;

  const serialized = serializeError(circular);
  assert.equal(serialized.name, "UnknownError");
  assert.equal(typeof serialized.message, "string");
});
