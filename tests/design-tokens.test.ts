import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { THEMES } from "@/lib/appearance";
import {
  type OklchColor,
  type TokenValue,
  parseOklch,
  parseTokenLayer,
  resolveColor,
} from "@/lib/design/tokens";

const CSS = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const LAYER = parseTokenLayer(CSS);

/** Every role a component is allowed to name, per Phase L2 item 1. */
const ROLES = [
  "--brand",
  "--brand-strong",
  "--brand-foreground",
  "--brand-text",
  "--brand-text-strong",
  "--brand-text-bright",
  "--brand-surface",
  "--fg-bright",
  "--fg-strong",
  "--fg",
  "--fg-soft",
  "--fg-muted",
  "--fg-subtle",
  "--fg-faint",
  "--surface-sunken",
  "--surface",
  "--surface-raised",
  "--surface-overlay",
  "--glass-fill",
  "--glass-fill-strong",
  "--glass-border",
  "--glass-highlight",
  "--hairline-subtle",
  "--hairline",
  "--hairline-strong",
  "--streaming",
  "--success",
  "--success-strong",
  "--success-text",
  "--success-surface",
  "--warning",
  "--warning-strong",
  "--warning-text",
  "--warning-surface",
  "--danger",
  "--danger-strong",
  "--danger-foreground",
  "--danger-text",
  "--danger-surface",
] as const;

/**
 * Tokens whose value is supplied outside this stylesheet. `next/font` writes
 * `--font-sora` and `--font-geist-mono` onto <html> at render time, so they
 * are legitimately undeclared here.
 */
/**
 * A value that points into the token layer rather than holding a number: a
 * `var()`, or a `light-dark()` whose two sides are both `var()`s. The second
 * form is how a role differs between themes without writing a colour twice.
 */
function isReference(value: TokenValue): boolean {
  return (
    value.kind === "reference" ||
    (value.kind === "themed" && isReference(value.light) && isReference(value.dark))
  );
}

const EXTERNALLY_PROVIDED = new Set(["--font-sora", "--font-geist-mono"]);

test("every @theme alias points at a token that exists", () => {
  const dangling = [...LAYER.aliases]
    .filter(([, target]) => !LAYER.tokens.has(target) && !EXTERNALLY_PROVIDED.has(target))
    .map(([alias, target]) => `${alias} -> ${target}`);

  assert.deepEqual(
    dangling,
    [],
    "an @theme alias forwarding to an undeclared token compiles to a utility class that resolves to nothing",
  );
});

test("every role resolves through its var() chain to a real colour", () => {
  const unresolved = ROLES.map((role) => ({ role, resolution: resolveColor(LAYER, role) })).filter(
    ({ resolution }) => !resolution.ok,
  );

  assert.deepEqual(
    unresolved.map(({ role }) => role),
    [],
  );
});

test("every role is exposed to Tailwind as a utility", () => {
  // `--glass-fill` is spelled `--color-glass` as a utility, and `--surface` is
  // `--color-surface`: the alias name is the class name, not the token name.
  const forwarded = new Set(LAYER.aliases.values());
  const unexposed = ROLES.filter((role) => !forwarded.has(role));

  assert.deepEqual(
    unexposed,
    [],
    "a role with no @theme alias cannot be written as a class, so a component has no way to obey the lint rule",
  );
});

test("the ember value is written in exactly one place", () => {
  const brand = resolveColor(LAYER, "--brand", "dark");
  assert.ok(brand.ok);

  // Not "no orange appears twice" — two ramp steps may legitimately share a
  // hue. The exit criterion is narrower and more useful: the *brand* value,
  // the one in the send button and the focus ring, is typed out once, so
  // changing that one line restyles the product.
  const literals = [...LAYER.tokens.values()].filter(
    ({ value }) => value.kind === "color" && sameColor(value.color, brand.color),
  );

  assert.deepEqual(
    literals.map(({ name }) => name),
    ["--ember-400"],
  );

  // And the light theme's brand is the same kind of thing: one ramp step,
  // reached through `--brand`, not a second ember written into a role.
  const light = resolveColor(LAYER, "--brand", "light");
  assert.ok(light.ok);
  assert.deepEqual(
    [...LAYER.tokens.values()]
      .filter(({ value }) => value.kind === "color" && sameColor(value.color, light.color))
      .map(({ name }) => name),
    ["--ember-600"],
  );
});

test("the ember ramp is eleven literal steps and nothing else names ember", () => {
  const ramp = [...LAYER.tokens.values()].filter(({ name }) => name.startsWith("--ember-"));

  assert.equal(ramp.length, 11);
  assert.deepEqual(
    ramp.filter(({ value }) => value.kind !== "color").map(({ name }) => name),
    [],
    "a ramp step that is a var() means the ramp is not the bottom of the chain",
  );
});

test("the brand roles all derive from the ramp", () => {
  for (const role of ROLES.filter((name) => name.startsWith("--brand"))) {
    const token = LAYER.tokens.get(role);
    assert.ok(token !== undefined, `${role} is not declared`);
    assert.ok(
      isReference(token.value),
      `${role} holds a literal colour; it must be a var() into a ramp`,
    );
  }
});

test("no component-facing colour is written as a legacy rgb() literal", () => {
  // Phase L2's premise: an ember or zinc number written anywhere but the ramps
  // is a decision that cannot be changed in one place. `rgb()` was how all of
  // them were written before this phase.
  assert.equal(CSS.includes("rgb("), false);
});

test("the shadcn tokens read from the roles rather than holding their own values", () => {
  for (const name of ["--primary", "--primary-foreground", "--ring", "--border", "--destructive"]) {
    const token = LAYER.tokens.get(name);
    assert.ok(token !== undefined, `${name} is not declared`);
    assert.ok(isReference(token.value), `${name} still holds a literal colour`);
  }
});

test("--primary is the brand, so a primary button is the action colour", () => {
  for (const theme of THEMES) {
    const primary = resolveColor(LAYER, "--primary", theme);
    const brand = resolveColor(LAYER, "--brand", theme);

    assert.ok(primary.ok && brand.ok);
    assert.deepEqual(primary.color, brand.color, theme);
  }
});

test("the text roles step away from the page without a tie, in both themes", () => {
  const weights = [
    "--fg-bright",
    "--fg-strong",
    "--fg",
    "--fg-soft",
    "--fg-muted",
    "--fg-subtle",
    "--fg-faint",
  ] as const;

  // "Bright" means most emphatic: the lightest text on a dark page and the
  // darkest on a light one. Each step is further toward the page than the
  // last, in whichever direction the page is.
  for (const theme of THEMES) {
    const toward = theme === "dark" ? -1 : 1;
    const lightnesses = weights.map((name) => {
      const resolution = resolveColor(LAYER, name, theme);
      assert.ok(resolution.ok, `${name} does not resolve in ${theme}`);
      return resolution.color.lightness;
    });

    for (let index = 1; index < lightnesses.length; index += 1) {
      const previous = lightnesses[index - 1];
      const current = lightnesses[index];
      assert.ok(previous !== undefined && current !== undefined);
      assert.ok(
        (current - previous) * toward > 0,
        `${weights[index]} is no fainter than ${weights[index - 1]} in ${theme}; the scale has a step that says nothing`,
      );
    }
  }
});

test("parseOklch reads both spellings of lightness and alpha", () => {
  assert.deepEqual(parseOklch("oklch(75% 0.183 55.934)"), {
    lightness: 0.75,
    chroma: 0.183,
    hue: 55.934,
    alpha: 1,
  });
  assert.deepEqual(parseOklch("oklch(0.13 0.006 75)"), {
    lightness: 0.13,
    chroma: 0.006,
    hue: 75,
    alpha: 1,
  });
  assert.deepEqual(parseOklch("oklch(100% 0 0 / 4.5%)"), {
    lightness: 1,
    chroma: 0,
    hue: 0,
    alpha: 0.045,
  });
  assert.deepEqual(parseOklch("oklch(0% 0 0 / 0.9)"), {
    lightness: 0,
    chroma: 0,
    hue: 0,
    alpha: 0.9,
  });
});

test("parseOklch rejects what is not a colour", () => {
  assert.equal(parseOklch("var(--brand)"), undefined);
  assert.equal(parseOklch("color-mix(in oklab, var(--brand) 34%, transparent)"), undefined);
  assert.equal(parseOklch("0.625rem"), undefined);
});

test("resolveColor reports the token that broke rather than throwing", () => {
  const layer = parseTokenLayer(":root { --a: var(--b); --b: var(--missing); }");
  const resolution = resolveColor(layer, "--a");

  assert.equal(resolution.ok, false);
  assert.deepEqual(resolution.failure, { reason: "missing", name: "--missing" });
});

test("resolveColor terminates on a cycle", () => {
  const layer = parseTokenLayer(":root { --a: var(--b); --b: var(--a); }");
  const resolution = resolveColor(layer, "--a");

  assert.equal(resolution.ok, false);
  assert.equal(resolution.failure.reason, "cycle");
});

test("a documented declaration inside a comment is not read as a real one", () => {
  const layer = parseTokenLayer("/* --ghost: oklch(1 0 0); */ :root { --real: oklch(1 0 0); }");

  assert.equal(layer.tokens.has("--ghost"), false);
  assert.equal(layer.tokens.has("--real"), true);
});

/* ── Scales (Phase L2 item 5) ───────────────────────────────────────────── */

test("the elevation scale is four black lifts and nothing coloured", () => {
  const steps = ["sm", "md", "lg", "xl"].map((step) => `--shadow-elevation-${step}`);

  for (const step of steps) {
    const token = LAYER.tokens.get(step);
    assert.ok(token !== undefined, `${step} is not declared`);
    assert.equal(token.value.kind, "other", `${step} should be a shadow, not a colour`);
    assert.ok(token.value.kind === "other" && token.value.raw.includes("var(--elevation-shade)"));
    for (const theme of THEMES) {
      const shade = resolveColor(LAYER, "--elevation-shade", theme);
      assert.ok(shade.ok && shade.color.lightness === 0 && shade.color.chroma === 0, theme);
    }
    assert.ok(
      token.value.kind === "other" && !token.value.raw.includes("--brand"),
      `${step} carries the brand; a coloured shadow is a glow and belongs on the other scale`,
    );
  }
});

test("every brand glow takes its colour from the brand rather than a literal", () => {
  const glows = [...LAYER.tokens.keys()].filter((name) => name.startsWith("--shadow-glow-"));

  assert.equal(glows.length, 5, "thirty arbitrary shadows collapse to four lifts and five glows");
  for (const name of glows) {
    const token = LAYER.tokens.get(name);
    assert.ok(token !== undefined);
    assert.ok(
      token.value.kind === "other" && /var\(--brand(-strong)?\)/u.test(token.value.raw),
      `${name} does not read from the brand`,
    );
  }
});

test("the blur scale covers the three radii the product uses, and only those", () => {
  const blurs = [...LAYER.tokens.keys()].filter((name) => name.startsWith("--blur-"));

  assert.deepEqual(blurs.sort(), ["--blur-glass", "--blur-glass-heavy", "--blur-glass-light"]);
});

test("--streaming is its own colour, not an alias of the action colour", () => {
  // It has its own name so ADR-0010's restraint rule can move the state
  // without moving the action. A name that resolves to the same value as
  // `--brand` would be a comment, not a role.
  const streaming = resolveColor(LAYER, "--streaming");
  const brand = resolveColor(LAYER, "--brand");

  assert.ok(streaming.ok && brand.ok);
  assert.notDeepEqual(streaming.color, brand.color);
});

test("the motion scale is one duration set and one emphasis curve", () => {
  const durations = [...LAYER.tokens.keys()].filter((name) => name.startsWith("--duration-"));
  assert.deepEqual(durations.sort(), [
    "--duration-base",
    "--duration-fast",
    "--duration-slow",
    "--duration-slower",
  ]);

  const ease = LAYER.tokens.get("--ease-emphasis");
  assert.ok(ease !== undefined);
  assert.ok(ease.value.kind === "other" && ease.value.raw.startsWith("cubic-bezier("));
});

test("the added type and radius steps exist, and Tailwind's own are untouched", () => {
  const twoXs = LAYER.tokens.get("--text-2xs");
  assert.ok(twoXs !== undefined, "--text-2xs is the one new type step");
  assert.ok(
    LAYER.tokens.has("--text-2xs--line-height"),
    "a type step without a line height is half a step",
  );
  assert.ok(LAYER.tokens.has("--radius-5xl"));

  // Redefining `--text-sm` would silently move 76 existing call sites.
  for (const step of ["--text-xs", "--text-sm", "--text-base", "--text-lg"]) {
    assert.equal(LAYER.tokens.has(step), false, `${step} is Tailwind's and must stay Tailwind's`);
  }
});

test("the glass utility is declared once, in both heavinesses, with the prefixed filter", () => {
  for (const name of ["glass", "glass-strong"]) {
    const block = utilityBlock(name);
    assert.ok(block !== undefined, `@utility ${name} is missing`);
    assert.match(block, /blur\(var\(--blur-glass\)\)/u);
    // Safari still ships the prefixed property; without it the fill renders
    // flat and the blur simply does not happen.
    assert.match(block, /-webkit-backdrop-filter/u);
    assert.match(block, /var\(--inset-shadow-highlight\)/u);
    // Radius and border are the caller's: a glass panel is a card in one place
    // and a full-bleed bar in another.
    assert.equal(/border(?!-)/u.test(block), false, `@utility ${name} bakes in a border`);
    assert.equal(/border-radius/u.test(block), false, `@utility ${name} bakes in a radius`);
  }
});

test("brand-headline carries its own transparent colour", () => {
  // Forgetting `color: transparent` at the call site renders solid foreground
  // text with an invisible gradient behind it, which reads as a design choice
  // rather than as a mistake. So it is part of the treatment, not the caller's.
  const block = utilityBlock("brand-headline");

  assert.ok(block !== undefined);
  assert.match(block, /background-clip: text/u);
  assert.match(block, /-webkit-background-clip: text/u);
  assert.match(block, /color: transparent/u);
});

test("the four glass fills ascend in alpha", () => {
  const alphas = [
    "--glass-fill",
    "--glass-fill-strong",
    "--glass-fill-heavy",
    "--glass-fill-solid",
  ].map((name) => {
    const resolution = resolveColor(LAYER, name);
    assert.ok(resolution.ok, `${name} does not resolve`);
    return resolution.color.alpha;
  });

  for (let index = 1; index < alphas.length; index += 1) {
    const previous = alphas[index - 1];
    const current = alphas[index];
    assert.ok(previous !== undefined && current !== undefined);
    assert.ok(current > previous, "a glass weight that is not heavier than the last says nothing");
  }
});

/** The body of `@utility <name> { … }`, or undefined if it is not declared. */
function utilityBlock(name: string): string | undefined {
  const start = CSS.indexOf(`@utility ${name} {`);
  if (start === -1) return undefined;

  const end = CSS.indexOf("}", start);
  return end === -1 ? undefined : CSS.slice(start, end);
}

/** OKLCH components compared at the precision the stylesheet writes them. */
function sameColor(left: OklchColor, right: OklchColor): boolean {
  return (
    Math.abs(left.lightness - right.lightness) < 1e-6 &&
    Math.abs(left.chroma - right.chroma) < 1e-6 &&
    Math.abs(left.hue - right.hue) < 1e-6 &&
    Math.abs(left.alpha - right.alpha) < 1e-6
  );
}
