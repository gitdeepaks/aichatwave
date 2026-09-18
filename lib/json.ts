/**
 * The JSON boundary type.
 *
 * Every payload that crosses a serialization boundary — an HTTP body, a tool
 * result, a checkpoint value, a provider error body — is JSON, and JSON is a
 * type we can name. Parsing into `JsonValue` at the edge is what keeps
 * `unknown` (and `JSON.parse`'s `any`) from travelling any further, per
 * constraint C1.
 *
 * Client-safe: one schema and one type, no imports beyond Zod.
 */

import { z } from "zod";

export const jsonValueSchema = z.json();
export type JsonValue = z.infer<typeof jsonValueSchema>;

/**
 * Parses JSON text into a named type, or `null` when the text is not JSON.
 *
 * `JSON.parse` returns `any`; every caller in this repo goes through here so
 * that `any` stops at one line.
 */
export function parseJsonText(text: string): JsonValue | null {
  try {
    return jsonValueSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * Normalizes any value into `JsonValue`, the way the wire would.
 *
 * `jsonValueSchema` rejects anything that is not already plain JSON — a class
 * instance with methods, a `Date`, a `Map` — but plenty of those serialize
 * perfectly well, because `JSON.stringify` honours `toJSON()`. Round-tripping
 * through it is therefore not a workaround: what comes back is exactly what a
 * client receiving this value over HTTP would have got.
 *
 * That equivalence is the point. A LangChain `ToolMessage` reaches the turn
 * recorder as a live object and reaches the browser as its serialized envelope;
 * persisting the serialized form is what makes the reloaded conversation and
 * the streamed one the same thing.
 *
 * Returns `null` for values JSON cannot represent at all — a cycle, a bare
 * `undefined`, a function.
 */
export function toJsonValue(value: unknown): JsonValue | null {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? null : parseJsonText(text);
  } catch {
    return null;
  }
}
