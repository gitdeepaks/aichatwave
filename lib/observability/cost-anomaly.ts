/**
 * Spend anomaly detection, kept pure so the threshold can be argued about in a
 * test rather than in production at 3am.
 *
 * Deliberately robust rather than clever. A mean-and-standard-deviation band
 * is the obvious choice and the wrong one here: one runaway day inflates both
 * the mean and the deviation, so the day *after* an incident quietly raises
 * the bar and the second incident goes unnoticed. The median and the median
 * absolute deviation are unmoved by up to half the sample being garbage, which
 * is the property this needs.
 *
 * The floor matters as much as the multiplier. Spend per user is frequently
 * cents, and "today is 8x the median" is true and meaningless when the median
 * is $0.002. Nothing below `minimumUsd` is ever an anomaly.
 */

export type AnomalyVerdict =
  | {
      readonly anomalous: false;
      readonly reason: "insufficient_history" | "below_floor" | "within_band";
    }
  | {
      readonly anomalous: true;
      /** Today's spend divided by the baseline median. */
      readonly ratio: number;
      /** The dollar figure today had to clear to be flagged. */
      readonly threshold: number;
    };

export type SpendAnomalyParams = {
  /** One entry per prior day, oldest or newest first — order is irrelevant to a median. */
  readonly baselineUsd: readonly number[];
  readonly todayUsd: number;
  /** Below this, no amount of relative growth is an anomaly. Default $1. */
  readonly minimumUsd?: number;
  /** How many times the baseline counts as anomalous. Default 4x. */
  readonly multiplier?: number;
  /** Days of history required before a judgement is offered. Default 5. */
  readonly minimumDays?: number;
};

export function detectSpendAnomaly(params: SpendAnomalyParams): AnomalyVerdict {
  const { baselineUsd, todayUsd, minimumUsd = 1, multiplier = 4, minimumDays = 5 } = params;

  if (baselineUsd.length < minimumDays) {
    return { anomalous: false, reason: "insufficient_history" };
  }
  if (todayUsd < minimumUsd) {
    return { anomalous: false, reason: "below_floor" };
  }

  const baseline = median(baselineUsd);
  // A brand-new payer has a zero median and every dollar is "infinitely" more
  // than nothing. The floor above is what keeps that from paging; the spread
  // term keeps the band from collapsing to zero.
  const spread = medianAbsoluteDeviation(baselineUsd);
  const threshold = Math.max(minimumUsd, baseline * multiplier + spread * multiplier);

  if (todayUsd < threshold) {
    return { anomalous: false, reason: "within_band" };
  }

  return {
    anomalous: true,
    ratio: baseline > 0 ? todayUsd / baseline : Number.POSITIVE_INFINITY,
    threshold,
  };
}

/** Returns 0 for an empty sample: there is no middle of nothing, and 0 is the identity here. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return 0;

  if (sorted.length % 2 === 1) return upper;

  const lower = sorted[middle - 1];
  return lower === undefined ? upper : (lower + upper) / 2;
}

/** The median of each point's distance from the median — a spread that one outlier cannot move. */
export function medianAbsoluteDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
}
