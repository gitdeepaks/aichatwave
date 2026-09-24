import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Linter, RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import noRawPalette from "../eslint-rules/no-raw-palette.mjs";
import { UNMIGRATED_PALETTE_FILES } from "../eslint-rules/unmigrated-palette-files.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rule = noRawPalette.rules["no-raw-palette"];

/**
 * `RuleTester` reports through `describe`/`it` when they are global. Under
 * `node --test` they are imports rather than globals, so it falls back to
 * running each case inline and throwing on the first failure — which is what
 * makes wrapping the whole suite in one `test()` the right shape here.
 */
const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

test("the rule rejects palette literals and accepts token roles", () => {
  tester.run("no-raw-palette", rule, {
    valid: [
      // Roles are the point of the phase.
      { code: 'const c = "bg-surface-raised text-fg-muted border-hairline";' },
      { code: 'const c = "bg-brand text-brand-foreground ring-brand";' },
      { code: 'const c = "hover:bg-glass-strong focus-visible:ring-brand/70";' },
      // shadcn's own semantic tokens were never the problem.
      { code: 'const c = "bg-background text-muted-foreground border-border";' },
      // A palette word that is not a colour utility.
      { code: 'const label = "Slate roofing, 100 year warranty";' },
      { code: 'const id = "zinc-400-bucket";' },
      { code: 'const c = "gap-white-space";' },
      // Arbitrary values that are not colours.
      { code: 'const c = "text-[14px] rounded-[30px] w-[calc(100%-2rem)]";' },
      // An arbitrary value whose colour comes from a token is the fix, not the
      // problem — a gradient's geometry is per-surface and only the colour is
      // shared, so this is how the atmosphere is written now.
      {
        code: 'const c = "bg-[radial-gradient(ellipse_80%_45%_at_50%_-8%,var(--bloom-ember),transparent_60%)]";',
      },
      {
        code: 'const c = "[mask-image:radial-gradient(ellipse_90%_75%_at_50%_30%,black,transparent)]";',
      },
      // A file on the ratchet is silent, however many literals it holds.
      {
        code: 'const c = "bg-zinc-900 text-orange-300";',
        filename: "components/chat/chat-composer.tsx",
        options: [{ allow: ["components/chat/chat-composer.tsx"] }],
      },
    ],
    invalid: [
      {
        code: 'const c = "bg-zinc-900";',
        errors: [{ messageId: "namedPalette" }],
      },
      // Every literal in one string, not just the first: a className regularly
      // carries several, and reporting one at a time makes a mechanical
      // migration into a long one.
      {
        code: 'const c = "bg-zinc-950/45 border-white/10 text-orange-300";',
        errors: [
          { messageId: "namedPalette" },
          { messageId: "namedPalette" },
          { messageId: "namedPalette" },
        ],
      },
      // Variants, stacked and with their own brackets.
      {
        code: 'const c = "data-[active=true]:from-orange-500/25";',
        errors: [{ messageId: "namedPalette" }],
      },
      {
        code: 'const c = "supports-[backdrop-filter]:bg-zinc-950/35";',
        errors: [{ messageId: "namedPalette" }],
      },
      {
        code: 'const c = "group-hover:hover:text-zinc-100";',
        errors: [{ messageId: "namedPalette" }],
      },
      // `white` and `black` take no shade.
      {
        code: 'const c = "bg-white/[0.045] text-black";',
        errors: [{ messageId: "namedPalette" }, { messageId: "namedPalette" }],
      },
      // Arbitrary colour values are the same problem spelled differently.
      {
        code: 'const c = "bg-[#08080a]";',
        errors: [{ messageId: "arbitraryColor" }],
      },
      {
        code: 'const c = "shadow-[oklch(0%_0_0/0.9)]";',
        errors: [{ messageId: "arbitraryColor" }],
      },
      // Nested inside a gradient, which is where the whole ember atmosphere
      // hid: a rule that only looked at the first character inside the
      // brackets never reached it.
      {
        code: 'const c = "bg-[radial-gradient(ellipse_80%_45%_at_50%_-8%,rgba(249,115,22,0.26),transparent_60%)]";',
        errors: [{ messageId: "arbitraryColor" }],
      },
      // Arbitrary *property* syntax, which carries no utility prefix at all.
      // The 64px marketing grid lived here.
      {
        code: 'const c = "[background-image:linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px)]";',
        errors: [{ messageId: "arbitraryColor" }],
      },
      // Template literals, which is how conditional classes are written.
      {
        code: "const c = `flex ${x} text-zinc-400`;",
        errors: [{ messageId: "namedPalette" }],
      },
      // A hex followed by Tailwind's underscore-for-space. `\b` sees no
      // boundary between `f` and `_`, which is how the workspace's ground
      // gradient sat unreported in a file the ratchet called migrated.
      {
        code: 'const c = "bg-[radial-gradient(circle_at_50%_-10%,#31200f_0%,transparent_42%)]";',
        errors: [{ messageId: "arbitraryColor" }],
      },
      // JSX, the shape this actually appears in.
      {
        code: '<div className="bg-zinc-900/90 text-zinc-100" />;',
        errors: [{ messageId: "namedPalette" }, { messageId: "namedPalette" }],
      },
      // A file not on the ratchet is not exempt because another one is.
      {
        code: 'const c = "text-zinc-400";',
        filename: "components/chat/chat-shell.tsx",
        options: [{ allow: ["components/chat/chat-composer.tsx"] }],
        errors: [{ messageId: "namedPalette" }],
      },
    ],
  });
});

test("the message names the literal it found", () => {
  // Without the match interpolated, a `className` carrying eight literals
  // reports eight identical lines and the reader has to find them by hand.
  const messages = rule.meta?.messages ?? {};

  for (const id of ["namedPalette", "arbitraryColor"]) {
    const template = messages[id];
    assert.ok(typeof template === "string", `${id} has no message`);
    assert.match(template, /\{\{match\}\}/u);
  }
});

test("the ratchet names exactly the files that still hold a literal", () => {
  // The strongest form of the exit criterion, and the one that maintains
  // itself: a migrated file left on the list fails here, so a migration commit
  // cannot forget to shorten it, and the list can never drift into permission.
  assert.deepEqual(offendingFiles(), [...UNMIGRATED_PALETTE_FILES].sort());
});

test("every path on the ratchet is a repo-relative file that exists", () => {
  const malformed = UNMIGRATED_PALETTE_FILES.filter(
    (path) => path.startsWith("/") || path.includes("\\") || !existsSync(resolve(REPO, path)),
  );

  assert.deepEqual(malformed, [], "a path the rule cannot match silently exempts nothing");
  assert.equal(
    new Set(UNMIGRATED_PALETTE_FILES).size,
    UNMIGRATED_PALETTE_FILES.length,
    "a duplicated path means a migration commit deleted one of two entries and left the file exempt",
  );
});

/**
 * Every file under `app/` and `components/` that still spells a colour, found
 * by running the rule itself rather than by a second regex that could disagree
 * with it. `components/ui/` and `components/ai-elements/` are excluded for the
 * same reasons `eslint.config.mjs` excludes them: both are CLI output.
 */
function offendingFiles(): string[] {
  const linter = new Linter();
  const config: Linter.Config = {
    files: ["**/*.tsx"],
    languageOptions: { parser: tseslint.parser },
    plugins: { design: noRawPalette },
    rules: { "design/no-raw-palette": "error" },
  };

  const offenders: string[] = [];
  for (const relative of sourceFiles()) {
    const messages = linter.verify(readFileSync(resolve(REPO, relative), "utf8"), [config], {
      filename: resolve(REPO, relative),
    });
    // By rule id, not by message count. `linter.verify` also reports its own
    // problems — an inline `eslint-disable` naming a rule this minimal config
    // does not load reads as a message here, and counting it would mark a file
    // as holding a literal it does not hold.
    if (messages.some((message) => message.ruleId === "design/no-raw-palette")) {
      offenders.push(relative);
    }
  }

  return offenders.sort();
}

function sourceFiles(): string[] {
  const found: string[] = [];

  function walk(relative: string): void {
    for (const entry of readdirSync(resolve(REPO, relative), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (child === "components/ui" || child === "components/ai-elements") continue;
        walk(child);
      } else if (entry.name.endsWith(".tsx")) {
        found.push(child);
      }
    }
  }

  walk("app");
  walk("components");
  return found;
}
