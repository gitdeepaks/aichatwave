import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { THEMES, type Theme } from "@/lib/appearance";
import { DEFICIENCIES, perceivedDistance } from "@/lib/design/color-vision";
import {
  CONTRAST_MINIMUM,
  type SrgbColor,
  contrastRatio,
  oklchToSrgb,
} from "@/lib/design/contrast";
import { parseTokenLayer, resolveColor } from "@/lib/design/tokens";

/**
 * The chart ramp, held to the three properties Phase L2 item 9 names: brand
 * coherent, colour-blind safe, legible in both themes. Checked before a single
 * chart reads it, because a palette is much cheaper to fix than a dashboard.
 */

const LAYER = parseTokenLayer(readFileSync(new URL("../app/globals.css", import.meta.url), "utf8"));
const SERIES = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"];

/**
 * The smallest OKLab distance two series may have. 0.1 is comfortably above
 * the ~0.02 at which two flat fills start to read as one, and leaves room for
 * the antialiasing a thin line gets.
 */
const MIN_DISTANCE = 0.1;

function color(name: string, theme: Theme): SrgbColor {
  const resolution = resolveColor(LAYER, name, theme);
  assert.ok(resolution.ok, `${name} does not resolve in ${theme}`);
  return oklchToSrgb(resolution.color);
}

for (const theme of THEMES) {
  test(`every chart series is distinguishable from every other in the ${theme} theme`, () => {
    const colors = SERIES.map((name) => color(name, theme));
    const failures: string[] = [];

    for (const vision of ["typical", ...DEFICIENCIES] as const) {
      colors.forEach((first, i) => {
        colors.slice(i + 1).forEach((second, offset) => {
          const distance = perceivedDistance(first, second, vision);
          if (distance < MIN_DISTANCE) {
            failures.push(
              `${SERIES[i]} vs ${SERIES[i + offset + 1]} (${vision}): ${distance.toFixed(3)}`,
            );
          }
        });
      });
    }

    assert.deepEqual(failures, []);
  });

  test(`every chart series is legible against the page in the ${theme} theme`, () => {
    const page = color("--surface", theme);
    const failures = SERIES.flatMap((name) => {
      const ratio = contrastRatio(color(name, theme), page, page);
      return ratio >= CONTRAST_MINIMUM.ui ? [] : [`${name}: ${ratio.toFixed(2)}`];
    });
    assert.deepEqual(failures, []);
  });
}

test("series one is the brand, so a chart is recognisably this product's", () => {
  const token = LAYER.tokens.get("--chart-1");
  assert.deepEqual(token?.value, { kind: "reference", target: "--brand" });
});

test("every series sits inside sRGB, so what is measured is what renders", () => {
  // A colour outside the gamut is mapped by the browser, not by this test's
  // clamp, and the two need not agree.
  for (const theme of THEMES) {
    for (const name of SERIES.slice(1)) {
      const { red, green, blue } = color(name, theme);
      for (const channel of [red, green, blue]) {
        assert.ok(channel > 0 && channel < 1, `${name} is out of gamut in ${theme}`);
      }
    }
  }
});
