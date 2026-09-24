import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { THEMES, type Theme } from "@/lib/appearance";
import {
  CONTRAST_MINIMUM,
  type ContrastLevel,
  type SrgbColor,
  composite,
  contrastRatio,
  oklchToSrgb,
  relativeLuminance,
} from "@/lib/design/contrast";
import { parseTokenLayer, resolveColor } from "@/lib/design/tokens";

/**
 * Every foreground/background pair the product draws, held to WCAG AA in both
 * themes (Phase L2 item 7).
 *
 * axe-core (Phase K) checks what a page renders in one theme on one run. This
 * checks the token pairs themselves, in both themes, before a component uses
 * them — including the pairs that only appear in a state an E2E run never
 * reaches: a disabled row, an error pill, a paging SLO.
 *
 * A pair is written the way a component writes it: `text-fg-muted` on
 * `bg-surface-raised`. `ground` is what a translucent background sits on,
 * defaulting to the page.
 */

const LAYER = parseTokenLayer(readFileSync(new URL("../app/globals.css", import.meta.url), "utf8"));

type Pair = {
  readonly foreground: string;
  readonly background: string;
  readonly level: ContrastLevel;
  /** A Tailwind opacity modifier on the background — `bg-danger/10` is `0.1`. */
  readonly backgroundOpacity?: number;
  readonly ground?: string;
};

const SURFACES = ["--surface", "--surface-sunken", "--surface-raised", "--surface-overlay"];

/** Body text at six weights. `fg-faint` is below, at the non-text floor. */
const TEXT = ["--fg-bright", "--fg-strong", "--fg", "--fg-soft", "--fg-muted", "--fg-subtle"];

const PAIRS: readonly Pair[] = [
  // The text scale on every surface, and on glass over the page and the well.
  ...TEXT.flatMap((foreground) =>
    SURFACES.map((background): Pair => ({ foreground, background, level: "text" })),
  ),
  ...TEXT.flatMap((foreground) =>
    ["--glass-fill", "--glass-fill-strong"].flatMap((background) =>
      ["--surface", "--surface-sunken"].map(
        (ground): Pair => ({ foreground, background, ground, level: "text" }),
      ),
    ),
  ),

  // `fg-faint` is the keyboard hint, the disabled row, the "Pro" tag on a
  // model you cannot pick: incidental text, which WCAG 1.4.3 exempts from the
  // text minimum. It is held to the non-text minimum instead, so that it is
  // still legible — a role that fails even that is decoration pretending to
  // be text.
  ...SURFACES.map((background): Pair => ({ foreground: "--fg-faint", background, level: "ui" })),

  // Brand text: active icons, links, the eyebrow over a heading.
  ...["--brand-text", "--brand-text-strong", "--brand-text-bright"].flatMap((foreground) =>
    ["--surface", "--surface-sunken", "--surface-raised"].map(
      (background): Pair => ({ foreground, background, level: "text" }),
    ),
  ),

  // The action: a filled button's label on each stop of its gradient, at
  // rest and on hover — a gradient is only as legible as its worst stop.
  ...["--action-from", "--action-to", "--action-from-hover", "--action-to-hover"].map(
    (background): Pair => ({ foreground: "--action-foreground", background, level: "text" }),
  ),
  { foreground: "--brand-foreground", background: "--brand", level: "text" },
  { foreground: "--brand-foreground", background: "--brand-strong", level: "text" },
  { foreground: "--primary-foreground", background: "--primary", level: "text" },
  { foreground: "--sidebar-primary-foreground", background: "--sidebar-primary", level: "text" },
  { foreground: "--danger-foreground", background: "--danger", level: "text" },

  // The brand as a boundary: the focus ring and the active-state marker are
  // non-text UI and need 3:1 against whatever they sit on.
  ...SURFACES.map((background): Pair => ({ foreground: "--brand", background, level: "ui" })),
  ...SURFACES.map((background): Pair => ({ foreground: "--ring", background, level: "ui" })),
  ...["--surface", "--surface-raised"].map(
    (background): Pair => ({ foreground: "--streaming", background, level: "ui" }),
  ),

  // shadcn's own pairs, which `components/ui/` renders.
  { foreground: "--foreground", background: "--background", level: "text" },
  { foreground: "--card-foreground", background: "--card", level: "text" },
  { foreground: "--popover-foreground", background: "--popover", level: "text" },
  { foreground: "--muted-foreground", background: "--background", level: "text" },
  { foreground: "--muted-foreground", background: "--muted", level: "text" },
  { foreground: "--muted-foreground", background: "--card", level: "text" },
  { foreground: "--secondary-foreground", background: "--secondary", level: "text" },
  { foreground: "--accent-foreground", background: "--accent", level: "text" },
  { foreground: "--sidebar-foreground", background: "--sidebar", level: "text" },
  { foreground: "--sidebar-accent-foreground", background: "--sidebar-accent", level: "text" },
  { foreground: "--destructive", background: "--background", level: "text" },
  { foreground: "--destructive", background: "--card", level: "text" },

  // The state trio, as text on the page and on its own tinted pill — the
  // pill is how every status in the product is drawn (`bg-success/10`).
  ...(["success", "warning", "danger"] as const).flatMap((state): Pair[] => [
    { foreground: `--${state}-text`, background: `--${state}-surface`, level: "text" },
    { foreground: `--${state}-text`, background: "--surface", level: "text" },
    { foreground: `--${state}-text`, background: "--surface-raised", level: "text" },
    {
      foreground: `--${state}-text`,
      background: `--${state}`,
      backgroundOpacity: 0.1,
      level: "text",
    },
    { foreground: `--${state}`, background: "--surface", level: "ui" },
  ]),
  {
    foreground: "--danger-text",
    background: "--destructive",
    backgroundOpacity: 0.1,
    level: "text",
  },
];

function color(name: string, theme: Theme): SrgbColor {
  const resolution = resolveColor(LAYER, name, theme);
  assert.ok(
    resolution.ok,
    `${name} does not resolve in the ${theme} theme: ${JSON.stringify(resolution)}`,
  );
  return oklchToSrgb(resolution.color);
}

function describe(pair: Pair): string {
  const opacity = pair.backgroundOpacity === undefined ? "" : `/${pair.backgroundOpacity * 100}`;
  const ground = pair.ground === undefined ? "" : ` over ${pair.ground}`;
  return `${pair.foreground} on ${pair.background}${opacity}${ground}`;
}

for (const theme of THEMES) {
  test(`every token pair meets WCAG AA in the ${theme} theme`, () => {
    const page = color("--surface", theme);
    // The page is opaque by definition; anything translucent is measured on it.
    assert.equal(page.alpha, 1, "--surface must be opaque");

    const failures = PAIRS.flatMap((pair) => {
      const background = color(pair.background, theme);
      const faded = { ...background, alpha: background.alpha * (pair.backgroundOpacity ?? 1) };
      const ground = pair.ground === undefined ? page : composite(color(pair.ground, theme), page);
      const ratio = contrastRatio(color(pair.foreground, theme), faded, ground);
      const minimum = CONTRAST_MINIMUM[pair.level];

      return ratio >= minimum
        ? []
        : [`${describe(pair)}: ${ratio.toFixed(2)}, needs ${minimum} (${pair.level})`];
    });

    assert.deepEqual(failures, [], `${failures.length} pair(s) below AA in ${theme}`);
  });
}

test("the two themes are actually different", () => {
  // A theme that resolves every role to the same value as the other is a
  // `light-dark()` typo, not a theme.
  const light = relativeLuminance(color("--surface", "light"));
  const dark = relativeLuminance(color("--surface", "dark"));
  assert.ok(light > 0.8 && dark < 0.05, `surface luminance: light ${light}, dark ${dark}`);
});

test("the contrast maths reproduces WCAG's reference values", () => {
  const white = { red: 1, green: 1, blue: 1, alpha: 1 };
  const black = { red: 0, green: 0, blue: 0, alpha: 1 };

  assert.equal(contrastRatio(black, white, white).toFixed(1), "21.0");
  assert.equal(contrastRatio(white, white, white).toFixed(1), "1.0");
  // #767676 on white is the canonical 4.54:1 — the lightest grey that passes.
  const grey = { red: 0x76 / 255, green: 0x76 / 255, blue: 0x76 / 255, alpha: 1 };
  assert.equal(contrastRatio(grey, white, white).toFixed(2), "4.54");
});

test("OKLCH converts to the sRGB Tailwind publishes for the same colour", () => {
  // Tailwind's `orange-400` is `oklch(75% 0.183 55.934)`, which it also
  // publishes as #ff8904. Off by more than one level per channel is a bug.
  const orange = oklchToSrgb({ lightness: 0.75, chroma: 0.183, hue: 55.934, alpha: 1 });
  const expected = [0xff, 0x89, 0x04];
  const actual = [orange.red, orange.green, orange.blue].map((channel) => channel * 255);

  actual.forEach((channel, index) => {
    const target = expected[index];
    assert.ok(target !== undefined);
    assert.ok(Math.abs(channel - target) <= 1.5, `channel ${index}: ${channel} vs ${target}`);
  });
});
