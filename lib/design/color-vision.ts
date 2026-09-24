/**
 * How far apart two colours are, for a reader with full colour vision and for
 * one with each of the three dichromacies (Phase L2 item 9).
 *
 * The chart ramp is the one place in the product where colour carries meaning
 * on its own — series three is not labelled "series three" on every point —
 * so it is the one place where a pair that looks distinct to its author and
 * identical to one reader in twelve is a bug rather than a taste.
 *
 * Simulation is Machado, Oliveira and Fernandes (2009) at full severity, which
 * operates on linear sRGB. Distance is Euclidean in OKLab, where a unit is
 * roughly perceptually even; the threshold is the caller's.
 */

import type { SrgbColor } from "@/lib/design/contrast";

export const DEFICIENCIES = ["protanopia", "deuteranopia", "tritanopia"] as const;
export type Deficiency = (typeof DEFICIENCIES)[number];
export type Vision = "typical" | Deficiency;

type Matrix = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

const MACHADO: Readonly<Record<Deficiency, Matrix>> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

type Linear = readonly [number, number, number];

function toLinear(color: SrgbColor): Linear {
  const decode = (channel: number): number =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return [decode(color.red), decode(color.green), decode(color.blue)];
}

function simulate(linear: Linear, vision: Vision): Linear {
  if (vision === "typical") return linear;
  const [r, g, b] = linear;
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  const [x, y, z] = MACHADO[vision];
  return [
    clamp(x[0] * r + x[1] * g + x[2] * b),
    clamp(y[0] * r + y[1] * g + y[2] * b),
    clamp(z[0] * r + z[1] * g + z[2] * b),
  ];
}

function toOklab([r, g, b]: Linear): Linear {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab distance between two opaque colours as `vision` perceives them. */
export function perceivedDistance(first: SrgbColor, second: SrgbColor, vision: Vision): number {
  const [l1, a1, b1] = toOklab(simulate(toLinear(first), vision));
  const [l2, a2, b2] = toOklab(simulate(toLinear(second), vision));
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
