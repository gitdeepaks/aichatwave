import assert from "node:assert/strict";
import test from "node:test";
import { jsonValueSchema, parseJsonText } from "@/lib/json";

test("parses JSON text into a value", () => {
  assert.deepEqual(parseJsonText('{"a":[1,null,"x"]}'), { a: [1, null, "x"] });
  assert.equal(parseJsonText("null"), null);
  assert.equal(parseJsonText("42"), 42);
});

test("returns null for text that is not JSON, instead of throwing", () => {
  assert.equal(parseJsonText(""), null);
  assert.equal(parseJsonText("not json"), null);
  assert.equal(parseJsonText("{unclosed"), null);
});

test("the schema accepts JSON values and rejects what cannot survive a round-trip", () => {
  assert.deepEqual(jsonValueSchema.parse({ nested: { list: [true, 1.5] } }), {
    nested: { list: [true, 1.5] },
  });
  assert.equal(jsonValueSchema.safeParse(undefined).success, false);
  assert.equal(jsonValueSchema.safeParse(() => 1).success, false);
  assert.equal(jsonValueSchema.safeParse(new Date()).success, false);
});
