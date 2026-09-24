/**
 * WCAG 2.x contrast between two token colours (Phase L2 item 7).
 *
 * axe-core checks the contrast of what a page happens to render; it cannot
 * check a token pair that no page renders at the moment the audit runs, and it
 * sees one theme per run. This checks the pairs themselves, in both themes, from
 * the stylesheet — so a role that fails contrast fails the build before any
 * component uses it.
 *
 * The maths is the published one, in the order a browser applies it: OKLCH to
 * OKLab to linear sRGB, clamped into gamut and gamma-encoded; translucent
 * layers composited over what is beneath them in gamma space, which is how
 * CSS blends; then WCAG relative luminance and the (L1 + 0.05) / (L2 + 0.05)
 * ratio.
 *
 * Pure: colours in, numbers out.
 */

import type { OklchColor } from "@/lib/design/tokens";

/** A gamma-encoded sRGB colour, each channel `0`–`1`, with its alpha. */
export type SrgbColor = {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
};

/** WCAG's thresholds. `text` is body copy; `ui` is large text and non-text UI. */
export const CONTRAST_MINIMUM = { text: 4.5, ui: 3 } as const;
export type ContrastLevel = keyof typeof CONTRAST_MINIMUM;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function encodeGamma(linear: number): number {
  const channel = clamp01(linear);
  return channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function decodeGamma(encoded: number): number {
  return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
}

/** OKLCH to gamma-encoded sRGB, per Björn Ottosson's reference matrices. */
export function oklchToSrgb(color: OklchColor): SrgbColor {
  const hue = (color.hue * Math.PI) / 180;
  const a = color.chroma * Math.cos(hue);
  const b = color.chroma * Math.sin(hue);

  const l = (color.lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (color.lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (color.lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    red: encodeGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    green: encodeGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    blue: encodeGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    alpha: color.alpha,
  };
}

/** `top` painted over `bottom`, in gamma space, as CSS composites. */
export function composite(top: SrgbColor, bottom: SrgbColor): SrgbColor {
  const alpha = top.alpha + bottom.alpha * (1 - top.alpha);
  if (alpha === 0) return { red: 0, green: 0, blue: 0, alpha: 0 };

  const mix = (over: number, under: number): number =>
    (over * top.alpha + under * bottom.alpha * (1 - top.alpha)) / alpha;

  return {
    red: mix(top.red, bottom.red),
    green: mix(top.green, bottom.green),
    blue: mix(top.blue, bottom.blue),
    alpha,
  };
}

/** WCAG relative luminance of an opaque colour. */
export function relativeLuminance(color: SrgbColor): number {
  return (
    0.2126 * decodeGamma(color.red) +
    0.7152 * decodeGamma(color.green) +
    0.0722 * decodeGamma(color.blue)
  );
}

/**
 * The WCAG ratio of a foreground over a background, `1`–`21`.
 *
 * Both are composited first — the background over `ground`, the foreground
 * over the result — because a translucent role has no contrast on its own:
 * `fg-muted` over `glass` depends on what the glass is over.
 */
export function contrastRatio(
  foreground: SrgbColor,
  background: SrgbColor,
  ground: SrgbColor,
): number {
  const settled = composite(background, ground);
  const text = composite(foreground, settled);

  const lighter = Math.max(relativeLuminance(text), relativeLuminance(settled));
  const darker = Math.min(relativeLuminance(text), relativeLuminance(settled));
  return (lighter + 0.05) / (darker + 0.05);
}
