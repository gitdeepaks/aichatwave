import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Every design-system class the source uses must exist in the built CSS.
 *
 * This is the one failure mode the type system, the contract tests and the
 * lint rule all miss. Tailwind generates a utility from a theme key; ask for a
 * key that is not there — `text-fg-mutted`, `shadow-elevation-xxl`,
 * `bg-surfce-raised` — and it generates *nothing*. No error, no warning, no
 * class in the stylesheet. The element simply renders with no colour, which on
 * a dark canvas most often reads as "that looks about right".
 *
 * It is a real risk rather than a theoretical one: Phase L2 migrates 619
 * literals into token names by hand, one file at a time, and a name is the
 * only thing being typed.
 *
 * So: scan the source for classes in the design system's namespaces, scan the
 * built CSS for the selectors it emitted, and fail on the difference. It runs
 * after `pnpm build` because the build output is the artifact that ships —
 * checking the stylesheet source would only prove the token was declared, not
 * that a utility came out the other end.
 */

const SOURCE_ROOTS = ["app", "components"];
const BUILD_CSS_ROOT = ".next/static/chunks";

/**
 * The namespaces this phase owns. Tailwind's own utilities are not checked:
 * `text-sm` and `rounded-full` are the framework's problem, and a typo in one
 * of them is caught by the same missing-class symptom in a place where the
 * framework's own docs are the reference.
 */
const NAMESPACES = [
  "brand",
  "fg",
  "surface",
  "glass",
  "hairline",
  "streaming",
  "success",
  "warning",
  "danger",
  "elevation",
  "glow",
  "highlight",
  "ember",
];

/**
 * A stack of Tailwind variants: `hover:`, `data-[active=true]:`,
 * `group-data-[collapsible=icon]:`, `supports-[backdrop-filter]:` and the
 * arbitrary `[&_svg]:` form. Capturing the whole stack matters — Tailwind
 * emits the selector for the *full* chain and nothing for its tail, so a
 * candidate that starts at `text-` would be reported missing every time.
 */
const VARIANT = String.raw`(?:(?:\[[^\]\s]*\]|[a-z0-9@-]+(?:-\[[^\]\s]*\])?):)*`;

/**
 * A candidate class inside a string literal. Loose on the left — it has to
 * survive `hover:`, `data-[active=true]:` and
 * `group-data-[collapsible=icon]:` — and anchored on a utility prefix, without
 * which every occurrence of the words `streaming`, `surface` and `success` in
 * ordinary TypeScript would be read as a class name.
 */
const CANDIDATE = new RegExp(
  String.raw`(?<![\w-])(` +
    VARIANT +
    String.raw`-?` +
    String.raw`(?:bg|text|border|ring|inset-ring|outline|divide|placeholder|caret|accent|decoration|fill|stroke|shadow|inset-shadow|from|via|to|blur|backdrop-blur|duration|ease|rounded)-` +
    String.raw`(?:${NAMESPACES.join("|")})(?:-[a-z0-9]+)*(?:\/(?:\d{1,3}|\[[^\]\s]*\]))?)(?![\w-])`,
  "gu",
);

/**
 * A colour-carrying class whose namespace segment is *not* one this phase
 * owns. Fed to the near-miss check below: `bg-surfce-raised` would otherwise
 * slip through, because `surfce` is not a namespace and so `CANDIDATE` never
 * looks at it — and a misspelt namespace is the worse of the two typos, since
 * it takes the whole class down rather than one token.
 */
const FOREIGN_NAMESPACE = new RegExp(
  String.raw`(?<![\w-])` +
    VARIANT +
    String.raw`-?` +
    String.raw`(?:bg|text|border|ring|inset-ring|outline|shadow|inset-shadow|from|via|to)-` +
    String.raw`([a-z]{4,})-[a-z0-9-]+(?![\w-])`,
  "gu",
);

/** Namespaces long enough that a one-character miss is a typo, not a word. */
const FUZZY_NAMESPACES = NAMESPACES.filter((namespace) => namespace.length >= 4);

/**
 * Palette names that are one edit from a namespace and are not typos of it.
 * `amber` and `ember` is the pair that matters, and it is not a coincidence —
 * the brand ramp is named after the colour the palette is named after. A raw
 * `amber-400` is a real class that compiles, so it does not belong in a report
 * about classes that compile to nothing; `design/no-raw-palette` is what
 * rejects it, and it does so with a message about the right subject.
 */
const CONFUSABLE_PALETTES = ["amber", "azure", "umber"];

/**
 * A string literal's contents. Scanning only inside strings is what keeps
 * `status === "streaming"` and `<BrandAtmosphere />` out of the results: a
 * class name only ever reaches the DOM through one of these.
 */
const STRING_LITERAL = /"([^"\\\n]*)"|'([^'\\\n]*)'|`([^`\\]*)`/gu;

/**
 * Whether a string is shaped like a class list rather than like prose. Used
 * only for the two bare utilities below, where there is no prefix to anchor
 * on and "a pane of glass" would otherwise be reported as a missing token.
 */
const CLASS_LIST = /^[a-z0-9\s:_/[\]().,%#&*<>=+-]*$/u;

/**
 * The composed utilities, which carry no colour prefix to anchor on. Ordered
 * longest first so `brand-wash-tile` is not reported as `brand-wash`.
 */
const BARE_UTILITIES = [
  "brand-action-vivid",
  "brand-wash-tile",
  "brand-action",
  "brand-glass",
  "brand-wash",
  "brand-rule",
  "glass-strong",
  "glass",
];

type Usage = {
  readonly className: string;
  readonly file: string;
};

async function main(): Promise<void> {
  const usages = await collectUsages();
  const stylesheet = await readBuiltCss();

  if (stylesheet === undefined) {
    console.error(
      `No built CSS under ${BUILD_CSS_ROOT}. Run \`pnpm build\` before \`pnpm design:verify\`.`,
    );
    process.exitCode = 1;
    return;
  }

  const missing = usages.filter(({ className }) => !emits(stylesheet, className));

  if (missing.length > 0) {
    console.error(`${missing.length} design-system class(es) compiled to nothing:\n`);
    for (const { className, file } of missing) {
      console.error(`  ${className}  —  ${file}  ${suggestion(className)}`);
    }
    console.error(
      "\nEach one is a token name the theme does not declare. Check the spelling against the token layer in `app/globals.css`.",
    );
    process.exitCode = 1;
    return;
  }

  const distinct = [...new Set(usages.map(({ className }) => className))].sort();
  // `--verbose` prints the inventory, which is how the migration's progress is
  // read: the list grows by one area per commit until the ratchet is empty.
  if (process.argv.includes("--verbose")) {
    for (const className of distinct) console.log(`  ${className}`);
  }
  console.log(
    `Design tokens verified: ${distinct.length} distinct class(es) across ${usages.length} use(s), all present in the built CSS.`,
  );
}

/**
 * Whether the stylesheet carries a rule for this class.
 *
 * The selector is matched on a boundary rather than by substring: `.bg-glass`
 * is a prefix of `.bg-glass-strong`, so a plain `includes` would report a
 * missing token as present whenever a longer one happened to exist.
 */
function emits(stylesheet: string, className: string): boolean {
  const selector = `.${escapeSelector(className)}`;
  let index = stylesheet.indexOf(selector);

  while (index !== -1) {
    const next = stylesheet[index + selector.length];
    if (next === undefined || !/[\w-]/u.test(next)) return true;
    index = stylesheet.indexOf(selector, index + 1);
  }

  return false;
}

/**
 * The closest namespace to the one a missing class used, when there is one.
 * A missing token is nearly always a misspelling, and naming the intended
 * spelling is the difference between a useful failure and a puzzle.
 */
function suggestion(className: string): string {
  const segments = className.split("-");
  for (const segment of segments) {
    if (NAMESPACES.includes(segment)) continue;
    const near = FUZZY_NAMESPACES.find((known) => isOneEditApart(segment, known));
    if (near !== undefined) return `(did you mean \`${near}\`?)`;
  }
  return "";
}

/** Levenshtein distance of exactly one: a substitution, insertion or deletion. */
function isOneEditApart(left: string, right: string): boolean {
  if (left === right) return false;
  if (Math.abs(left.length - right.length) > 1) return false;

  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  let shortIndex = 0;
  let longIndex = 0;
  let edits = 0;

  while (shortIndex < shorter.length && longIndex < longer.length) {
    if (shorter[shortIndex] === longer[longIndex]) {
      shortIndex += 1;
      longIndex += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) return false;
    if (shorter.length === longer.length) shortIndex += 1;
    longIndex += 1;
  }

  return edits + (longer.length - longIndex) + (shorter.length - shortIndex) === 1;
}

/**
 * How Tailwind escapes a class name when it writes the selector: everything
 * that is not a word character or a hyphen takes a backslash. Naming the
 * characters individually is what made this miss `=`, and a missed escape
 * reports a class that is present as absent — the failure mode that makes a
 * guard worse than no guard.
 */
function escapeSelector(className: string): string {
  return className.replaceAll(/[^\w-]/gu, (char) => `\\${char}`);
}

async function collectUsages(): Promise<Usage[]> {
  const usages: Usage[] = [];

  for (const root of SOURCE_ROOTS) {
    for (const file of await sourceFiles(root)) {
      const contents = await readFile(file, "utf8");

      for (const literal of contents.matchAll(STRING_LITERAL)) {
        const text = literal[1] ?? literal[2] ?? literal[3];
        if (text === undefined) continue;

        for (const match of text.matchAll(CANDIDATE)) {
          const className = match[1];
          if (className !== undefined) usages.push({ className, file });
        }

        for (const match of text.matchAll(FOREIGN_NAMESPACE)) {
          const [className, namespace] = match;
          if (namespace === undefined) continue;
          if (NAMESPACES.includes(namespace)) continue;
          if (CONFUSABLE_PALETTES.includes(namespace)) continue;
          if (!FUZZY_NAMESPACES.some((known) => isOneEditApart(namespace, known))) continue;
          usages.push({ className, file });
        }

        if (!CLASS_LIST.test(text)) continue;
        for (const utility of BARE_UTILITIES) {
          const pattern = new RegExp(String.raw`(?<![\w-])(${VARIANT}${utility})(?![\w-])`, "gu");
          for (const match of text.matchAll(pattern)) {
            const className = match[1];
            if (className !== undefined) usages.push({ className, file });
          }
        }
      }
    }
  }

  return usages;
}

async function sourceFiles(root: string): Promise<string[]> {
  const found: string[] = [];

  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await sourceFiles(path)));
    else if (path.endsWith(".tsx") || path.endsWith(".ts")) found.push(path);
  }

  return found;
}

/** Every built stylesheet concatenated: a class may land in any chunk. */
async function readBuiltCss(): Promise<string | undefined> {
  let entries;
  try {
    entries = await readdir(BUILD_CSS_ROOT, { withFileTypes: true });
  } catch {
    return undefined;
  }

  const sheets = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".css"));
  if (sheets.length === 0) return undefined;

  const contents = await Promise.all(
    sheets.map((sheet) => readFile(join(BUILD_CSS_ROOT, sheet.name), "utf8")),
  );
  return contents.join("\n");
}

void main();
