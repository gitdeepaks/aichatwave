/**
 * A colour is named once, in the token layer, and never spelled in a component
 * (Phase L2 item 4).
 *
 * `app/globals.css` declares the roles — `bg-surface-raised`, `text-fg-muted`,
 * `border-hairline`, `text-brand-text` — and ADR-0010 says what each one is
 * for. None of that survives review alone: the count reached 467 literals
 * across 43 files precisely because every one of them was individually
 * reasonable. This project's house style is that a constraint is a rule rather
 * than a habit (C1, C6, C8), and this is that rule.
 *
 * Rejected: any Tailwind palette class name (`bg-zinc-400`, `text-white/70`,
 * `border-orange-300/25`) and any arbitrary colour (`text-[#b4b4b4]`,
 * `bg-[rgb(24_24_27)]`).
 *
 * Exempt: `components/ui/`, which is shadcn CLI output that a regeneration
 * would revert, and the files still listed in `allow` — see below.
 *
 * ## The `allow` list is a ratchet
 *
 * The migration in item 3 runs file by file. Turning this rule on only at the
 * end would mean 43 files of unreviewable diff and no protection until then,
 * so instead it is on from the start with the unmigrated files named
 * explicitly. Every migration commit deletes its files from that list and can
 * never silently reintroduce a literal into a file already done. The list
 * reaching `[]` is the phase's exit criterion, readable in one place.
 *
 * A path on the list is not permission — it is a debt with a name on it.
 */

/** Tailwind v4's default palettes. `white` and `black` take no shade. */
const PALETTES = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];

/**
 * The utility prefixes that take a colour. Naming them rather than matching
 * any `-zinc-400` keeps the rule off prose and off identifiers that merely
 * contain a palette word.
 */
const PREFIXES = [
  "bg",
  "text",
  "border",
  "border-[a-z]",
  "ring",
  "ring-offset",
  "outline",
  "divide",
  "placeholder",
  "caret",
  "accent",
  "decoration",
  "fill",
  "stroke",
  "shadow",
  "from",
  "via",
  "to",
];

/** `hover:`, `dark:`, `sm:`, `group-hover:`, `data-[state=open]:`, `**:`, … */
const VARIANT = String.raw`(?:[a-z0-9-]+(?:-\[[^\]\s]*\])?:|\*\*?:)*`;

const SHADE = String.raw`(?:50|[1-9]00|950)`;
const OPACITY = String.raw`(?:\/(?:\d{1,3}|\[[^\]\s]*\]))?`;

const NAMED_COLOR = new RegExp(
  String.raw`(?<![\w-])${VARIANT}-?(?:${PREFIXES.join("|")})-` +
    String.raw`(?:(?:${PALETTES.join("|")})-${SHADE}|white|black)${OPACITY}(?![\w-])`,
  "gu",
);

/** `text-[#b4b4b4]`, `bg-[rgb(24_24_27)]`, `border-[oklch(…)]`. */
const ARBITRARY_COLOR = new RegExp(
  String.raw`(?<![\w-])${VARIANT}-?(?:${PREFIXES.join("|")})-\[` +
    String.raw`(?:#[0-9a-f]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\()[^\]]*\]`,
  "giu",
);

/** @type {import("eslint").Rule.RuleModule} */
const noRawPalette = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Use a design token role instead of a Tailwind palette literal or an arbitrary colour.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allow: {
            type: "array",
            items: { type: "string" },
            description:
              "Repo-relative paths not yet migrated. Each migration commit shortens this list.",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      namedPalette:
        '"{{match}}" names a colour in a component. Use the role that says what it is for — see the token layer in `app/globals.css` and ADR-0010.',
      arbitraryColor:
        '"{{match}}" writes a colour value in a component. Add a role to the token layer in `app/globals.css` and name that instead.',
    },
  },
  create(context) {
    const options = context.options[0];
    const allow = Array.isArray(options?.allow) ? options.allow : [];
    const filename = normalize(context.filename);

    if (allow.some((entry) => filename.endsWith(normalize(entry)))) return {};

    /**
     * Reports every match in one string. Whole-string rather than first-match
     * because a single `className` regularly carries several, and fixing them
     * one build at a time is how a mechanical migration becomes a long one.
     */
    function check(node, text) {
      for (const [pattern, messageId] of [
        [NAMED_COLOR, "namedPalette"],
        [ARBITRARY_COLOR, "arbitraryColor"],
      ]) {
        // A fresh regex per string: the shared ones are global, so `lastIndex`
        // would carry from the previous node and skip real matches.
        const scanner = new RegExp(pattern.source, pattern.flags);
        let match = scanner.exec(text);
        while (match !== null) {
          context.report({ node, messageId, data: { match: match[0] } });
          match = scanner.exec(text);
        }
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateElement(node) {
        const raw = node.value.cooked ?? node.value.raw;
        if (typeof raw === "string") check(node, raw);
      },
    };
  },
};

function normalize(path) {
  return path.replaceAll("\\", "/");
}

export default { rules: { "no-raw-palette": noRawPalette } };
