/**
 * The design token layer, parsed into named types.
 *
 * `app/globals.css` is the source of truth for every colour in the product
 * (Phase L2 item 1). CSS is not a type system, so a typo in `--color-fg-muted:
 * var(--fg-mutted)` produces no error anywhere — it produces a utility class
 * that silently resolves to nothing. This module parses the stylesheet once
 * into domain types so the contract tests can assert what CSS cannot:
 *
 * - every `@theme inline` alias points at a token that exists;
 * - every role resolves, through however many `var()` hops, to a real colour;
 * - the ember value is written in exactly one place.
 *
 * It is also what the WCAG contrast check in item 7 will read: contrast is a
 * function of two OKLCH triples, and this is where the triples come from.
 *
 * Pure, and deliberately so — it takes CSS text, not a path. Reading the file
 * belongs to the caller (a test, or a CI script).
 */

/** A colour in the OKLCH space, with every component resolved to a number. */
export type OklchColor = {
  /** Perceptual lightness, `0`–`1`. CSS writes it as either `0.75` or `75%`. */
  readonly lightness: number;
  /** Chroma, `0` upward. `0` is a true grey. */
  readonly chroma: number;
  /** Hue angle in degrees, `0`–`360`. Meaningless when chroma is `0`. */
  readonly hue: number;
  /** Alpha, `0`–`1`. `1` when the declaration omits it. */
  readonly alpha: number;
};

/**
 * What the right-hand side of a custom property declaration turned out to be.
 *
 * `other` is not a parse failure — `--radius: 0.625rem` and
 * `color-mix(in oklab, …)` are both legitimate token values that simply are
 * not a resolvable colour, and the contract tests care about the difference.
 */
export type TokenValue =
  | { readonly kind: "color"; readonly color: OklchColor }
  | { readonly kind: "reference"; readonly target: string }
  | { readonly kind: "other"; readonly raw: string };

/** One custom property declared in the token layer. */
export type DesignToken = {
  /** The property name, including its leading `--`. */
  readonly name: string;
  readonly value: TokenValue;
};

/** Every token and `@theme` alias the stylesheet declares. */
export type TokenLayer = {
  /**
   * The `@theme inline` block: a Tailwind utility name (`--color-fg-muted`)
   * mapped to the token it forwards to (`--fg-muted`). Only aliases that are a
   * single `var()` appear here; anything else is an ordinary token.
   */
  readonly aliases: ReadonlyMap<string, string>;
  /** Every declaration in the file, `@theme` aliases included. */
  readonly tokens: ReadonlyMap<string, DesignToken>;
};

/** Why {@link resolveColor} could not produce a colour. */
export type ResolutionFailure =
  | { readonly reason: "missing"; readonly name: string }
  | { readonly reason: "cycle"; readonly name: string }
  | { readonly reason: "not-a-color"; readonly name: string; readonly raw: string };

export type ColorResolution =
  | { readonly ok: true; readonly color: OklchColor }
  | { readonly ok: false; readonly failure: ResolutionFailure };

/** A `--name: value;` declaration. Comments are stripped before this runs. */
const DECLARATION = /(--[a-z0-9-]+)\s*:\s*([^;}]+)[;}]/giu;

/** A value that is nothing but one `var()`, with no fallback and no calc. */
const SOLE_VAR = /^var\(\s*(--[a-z0-9-]+)\s*\)$/iu;

const OKLCH = /^oklch\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/]+)\s*(?:\/\s*([^\s/]+)\s*)?\)$/iu;

/** Guards against a `var()` chain that never terminates. */
const MAX_HOPS = 16;

/**
 * Strips `/* … *\/` comments.
 *
 * Needed before anything else: this stylesheet documents itself heavily, and
 * several of those comments quote declarations (`--color-neutral-400`,
 * `--primary`) that must not be read as real ones.
 */
function stripComments(css: string): string {
  return css.replaceAll(/\/\*[\s\S]*?\*\//gu, "");
}

/**
 * Reads `0.75`, `75%` or `4.5%` as a fraction of one.
 *
 * CSS treats the two spellings as identical for OKLCH lightness and alpha, so
 * a token layer that mixes them — this one does, because the ramps are copied
 * verbatim from Tailwind and the rest was written by hand — has to normalise
 * before any two values can be compared.
 */
function parseScalar(raw: string, percentBasis: number): number | undefined {
  const trimmed = raw.trim();
  const isPercent = trimmed.endsWith("%");
  const numeric = Number.parseFloat(isPercent ? trimmed.slice(0, -1) : trimmed);

  if (!Number.isFinite(numeric)) return undefined;
  return isPercent ? numeric / percentBasis : numeric;
}

/** Parses `oklch(L C H)` or `oklch(L C H / A)`. Returns undefined otherwise. */
export function parseOklch(raw: string): OklchColor | undefined {
  const match = OKLCH.exec(raw.trim());
  if (match === null) return undefined;

  const [, rawLightness, rawChroma, rawHue, rawAlpha] = match;
  if (rawLightness === undefined || rawChroma === undefined || rawHue === undefined) {
    return undefined;
  }

  const lightness = parseScalar(rawLightness, 100);
  // Chroma's percentage basis is 0.4, not 1: `100%` means `0.4`.
  const chroma = parseScalar(rawChroma, 250);
  const hue = parseScalar(rawHue, 1);
  const alpha = rawAlpha === undefined ? 1 : parseScalar(rawAlpha, 100);

  if (lightness === undefined || chroma === undefined || hue === undefined || alpha === undefined) {
    return undefined;
  }

  return { lightness, chroma, hue, alpha };
}

function parseValue(raw: string): TokenValue {
  const trimmed = raw.trim();

  const reference = SOLE_VAR.exec(trimmed);
  const target = reference?.[1];
  if (target !== undefined) return { kind: "reference", target };

  const color = parseOklch(trimmed);
  if (color !== undefined) return { kind: "color", color };

  return { kind: "other", raw: trimmed };
}

/**
 * Finds the body of the first `@theme inline { … }` block.
 *
 * Brace counting rather than a regex: the block contains `calc(var(--radius) +
 * 4px)` and nested comment braces, and a non-greedy `\{[\s\S]*?\}` stops at
 * the first of those.
 */
function themeBlock(css: string): string {
  const start = css.indexOf("@theme inline");
  if (start === -1) return "";

  const open = css.indexOf("{", start);
  if (open === -1) return "";

  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    const char = css[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, index);
    }
  }
  return "";
}

function collect(css: string): Map<string, DesignToken> {
  const tokens = new Map<string, DesignToken>();
  // A fresh regex per call: `DECLARATION` is global and therefore stateful.
  const pattern = new RegExp(DECLARATION.source, DECLARATION.flags);

  let match = pattern.exec(css);
  while (match !== null) {
    const [, name, raw] = match;
    if (name !== undefined && raw !== undefined) {
      tokens.set(name, { name, value: parseValue(raw) });
    }
    match = pattern.exec(css);
  }

  return tokens;
}

/** Parses a stylesheet into its token layer. */
export function parseTokenLayer(css: string): TokenLayer {
  const source = stripComments(css);
  const tokens = collect(source);

  const aliases = new Map<string, string>();
  for (const [name, token] of collect(themeBlock(source))) {
    if (token.value.kind === "reference") aliases.set(name, token.value.target);
  }

  return { aliases, tokens };
}

/**
 * Follows a token through its `var()` chain to the colour at the end of it.
 *
 * Failure is returned rather than thrown because every caller is a report:
 * a contract test names the token that broke, and the contrast script lists
 * the pairs it could not evaluate instead of stopping at the first one.
 */
export function resolveColor(layer: TokenLayer, name: string): ColorResolution {
  const seen = new Set<string>();
  let current = name;

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (seen.has(current)) return { ok: false, failure: { reason: "cycle", name: current } };
    seen.add(current);

    const token = layer.tokens.get(current);
    if (token === undefined) return { ok: false, failure: { reason: "missing", name: current } };

    const { value } = token;
    switch (value.kind) {
      case "color":
        return { ok: true, color: value.color };
      case "reference":
        current = value.target;
        break;
      case "other":
        return { ok: false, failure: { reason: "not-a-color", name: current, raw: value.raw } };
    }
  }

  return { ok: false, failure: { reason: "cycle", name: current } };
}
