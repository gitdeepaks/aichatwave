/**
 * Replacing a module for the duration of one test file.
 *
 * The test runner transpiles TypeScript to CommonJS through `tsx`, so every
 * `import` in a module under test is a `require` at runtime and the module
 * registry is `require.cache`. Seeding that cache before the subject is loaded
 * is therefore all a stub needs to be — no loader hook, no experimental flag,
 * and no test-only seam threaded through production code.
 *
 * Two rules make this safe rather than clever:
 *
 *  1. **Stub before you import.** A static `import` at the top of a test file
 *     is hoisted, so the subject must be reached through `await import(...)`
 *     *inside* a test or hook. Every helper here is installed at module load,
 *     which is before any test body runs.
 *  2. **One process per file.** `node --test` runs each file in its own child
 *     process, so a stub installed in one file cannot leak into another.
 *
 * Only genuinely external edges are stubbed: Clerk (identity), Polar (billing),
 * the Vercel runtime (`waitUntil`), and OpenAI embeddings. Everything this
 * repository owns runs for real, against a real database.
 */

import { createRequire, Module } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requireFromHelpers = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Resolves a specifier the way the module under test will resolve it.
 *
 * `@/…` is this repository's tsconfig path alias. `tsx` rewrites it to an
 * absolute file path, so a stub has to be keyed by that same absolute path
 * rather than by the alias.
 */
function resolveModuleId(specifier: string): string {
  const target = specifier.startsWith("@/")
    ? path.join(repoRoot, specifier.slice("@/".length))
    : specifier;

  return requireFromHelpers.resolve(target);
}

/**
 * Installs `exports` as the module `specifier` resolves to.
 *
 * Nothing is saved for restoration: `node --test` gives each file its own
 * process, so a stub cannot outlive the file that installed it and there is
 * nothing to put back.
 *
 * Returns the resolved module id, which is useful in a failure message when a
 * stub silently did not apply because the subject was imported first.
 */
export function stubModule(specifier: string, exports: Record<string, unknown>): string {
  const id = resolveModuleId(specifier);

  const stub = new Module(id);
  stub.filename = id;
  stub.path = path.dirname(id);
  stub.loaded = true;
  stub.exports = exports;

  requireFromHelpers.cache[id] = stub;

  return id;
}

/** Whether `specifier` has already been loaded in this process. */
export function isModuleLoaded(specifier: string): boolean {
  try {
    return requireFromHelpers.cache[resolveModuleId(specifier)] !== undefined;
  } catch {
    return false;
  }
}
