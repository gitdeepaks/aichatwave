import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DENSITY_COOKIE,
  THEME_COLOR,
  THEME_COOKIE,
  THEMES,
  densityAttribute,
  parseDensity,
  parseThemePreference,
  preferenceCookie,
  themeClassName,
} from "@/lib/appearance";
import { oklchToSrgb } from "@/lib/design/contrast";
import { parseTokenLayer, resolveColor } from "@/lib/design/tokens";

const CSS = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const LAYER = parseTokenLayer(CSS);

test("an unreadable cookie falls back to the defaults, not to an error", () => {
  assert.equal(parseThemePreference(undefined), "system");
  assert.equal(parseThemePreference("sepia"), "system");
  assert.equal(parseThemePreference("light"), "light");
  assert.equal(parseDensity(undefined), "comfortable");
  assert.equal(parseDensity("cozy"), "comfortable");
  assert.equal(parseDensity("compact"), "compact");
});

test("system renders no class, so the operating system decides", () => {
  assert.equal(themeClassName("system"), undefined);
  assert.equal(themeClassName("light"), "light");
  assert.equal(themeClassName("dark"), "dark");
  assert.equal(densityAttribute("comfortable"), undefined);
  assert.equal(densityAttribute("compact"), "compact");
});

test("the preference cookie is site-wide and outlives the session", () => {
  const cookie = preferenceCookie(THEME_COOKIE, "dark");
  assert.match(cookie, /^aichatwave-theme=dark; /u);
  assert.match(cookie, /Path=\//u);
  assert.match(cookie, /Max-Age=31536000/u);
  assert.match(preferenceCookie(DENSITY_COOKIE, "compact"), /^aichatwave-density=compact; /u);
});

test("the browser chrome colour is the colour <body> paints, in each theme", () => {
  // `<meta name="theme-color">` cannot read a custom property, so the value is
  // written twice. This is what keeps the second copy honest.
  for (const theme of THEMES) {
    const sunken = resolveColor(LAYER, "--surface-sunken", theme);
    assert.ok(sunken.ok);
    const { red, green, blue } = oklchToSrgb(sunken.color);
    const hex = `#${[red, green, blue]
      .map((channel) =>
        Math.round(channel * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
    assert.equal(hex, THEME_COLOR[theme], theme);
  }
});

test("density moves spacing and nothing else", () => {
  // The exit criterion is "no reflow bugs, no clipped text". A density token
  // that is a length, overridden under compact with another length, cannot
  // change a type size, a colour or a layout mode — so the guarantee is held
  // by what the tokens are allowed to be, not by screenshots.
  const comfortable = [...CSS.matchAll(/^\s*(--density-[a-z-]+):\s*([^;]+);/gmu)];
  const names = new Set(comfortable.map(([, name]) => name));
  assert.deepEqual([...names].sort(), [
    "--density-bubble-x",
    "--density-bubble-y",
    "--density-row",
    "--density-transcript",
  ]);

  for (const [, name, value] of comfortable) {
    assert.match(value ?? "", /^\d+(\.\d+)?rem$/u, `${name} is not a length: ${value}`);
  }

  const compactBlock = /:root\[data-density="compact"\]\s*\{([^}]*)\}/u.exec(CSS)?.[1];
  assert.ok(compactBlock !== undefined, "no compact block");
  const overridden = [...compactBlock.matchAll(/(--[a-z-]+):/gu)].map(([, name]) => name);
  assert.deepEqual(
    overridden.sort(),
    [...names].sort(),
    "compact must override every density token and nothing that is not one",
  );
});

test("a compact row still fits a line of sidebar text", () => {
  // `text-sm` is a 20px line; a row shorter than that clips it.
  const row = /\[data-density="compact"\][^}]*--density-row:\s*([\d.]+)rem/u.exec(CSS)?.[1];
  assert.ok(row !== undefined);
  assert.ok(Number.parseFloat(row) * 16 >= 20 + 8, `compact row is ${row}rem`);
});
