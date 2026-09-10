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
