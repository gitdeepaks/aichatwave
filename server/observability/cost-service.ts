/**
 * Turns recorded tokens into the three views the cost dashboard shows, and
 * flags the users whose spend today does not look like their spend usually
 * does.
 *
 * Everything here is a fold over one list of (day, user, model) cells — see
 * `cost-repository.ts`. Doing the arithmetic in TypeScript rather than SQL is
 * what keeps `MODEL_REGISTRY` the only place a price is written down.
 *
 * These are **list prices**, not an invoice. Provider discounts, cached-input
 * rates and batch pricing are not modelled, and Polar remains the billing
 * record. What this answers is "where is the money going and did that change
 * today?", which is the question an anomaly alert needs and the one no
 * existing surface could answer at all.
 */

import { isModelId, messageCostUsd, type ModelId } from "@/lib/ai/model-registry";
import { detectSpendAnomaly, type AnomalyVerdict } from "@/lib/observability/cost-anomaly";
import type {
  CostByDayDto,
  CostByModelDto,
  CostByUserDto,
  CostBucketDto,
  CostReportResponse,
} from "@/lib/api/contracts";
import { listUsageBuckets, type UsageBucket } from "@/server/observability/cost-repository";

/**
 * Row ceiling for one report. A (day, user, model) grain over 90 days is at
 * most `days x users x models` rows; this bounds the pathological case without
 * silently lying about it — `truncated` is reported to the caller.
 */
const MAX_BUCKETS = 20_000;
/** Users shown in the per-user table. The anomaly scan still runs over all of them. */
const TOP_USER_LIMIT = 25;

type Accumulator = {
  messages: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  /** False once any cell in this bucket came from a model with no price. */
  fullyPriced: boolean;
};

function emptyAccumulator(): Accumulator {
  return { messages: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, fullyPriced: true };
}

function add(target: Accumulator, bucket: UsageBucket, cost: number | null): void {
  target.messages += bucket.messages;
  target.inputTokens += bucket.inputTokens;
  target.outputTokens += bucket.outputTokens;
  if (cost === null) target.fullyPriced = false;
  else target.costUsd += cost;
}

/**
 * A partly-priced bucket reports its cost as null rather than as the sum of
 * the priced half. A number that is quietly missing a model is worse than no
 * number: it looks authoritative and is wrong, and spend dashboards are read
 * as authoritative.
 */
function toBucketDto(accumulator: Accumulator): CostBucketDto {
  return {
    messages: accumulator.messages,
    inputTokens: accumulator.inputTokens,
    outputTokens: accumulator.outputTokens,
    costUsd: accumulator.fullyPriced ? round(accumulator.costUsd) : null,
  };
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function bucketCostUsd(bucket: UsageBucket): number | null {
  if (!isModelId(bucket.modelId)) return null;
  const modelId: ModelId = bucket.modelId;
  return messageCostUsd({
    modelId,
    inputTokens: bucket.inputTokens,
    outputTokens: bucket.outputTokens,
  });
}

/** `YYYY-MM-DD` in UTC, matching the bucket labels the query produces. */
export function utcDayLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function describeAnomaly(verdict: AnomalyVerdict): CostByUserDto["anomaly"] {
  if (verdict.anomalous) {
    return {
      anomalous: true,
      ratio: Number.isFinite(verdict.ratio) ? round(verdict.ratio) : null,
      reason: `above ${round(verdict.threshold)} USD, the trailing band for this user`,
    };
  }
  return { anomalous: false, ratio: null, reason: verdict.reason };
}

export async function buildCostReport(params: {
  readonly windowDays: number;
  readonly now?: Date;
}): Promise<CostReportResponse> {
  const now = params.now ?? new Date();
  const since = new Date(now.getTime() - params.windowDays * 24 * 60 * 60 * 1000);
  const buckets = await listUsageBuckets({ since, limit: MAX_BUCKETS });

  const today = utcDayLabel(now);

  const totals = emptyAccumulator();
  const byDay = new Map<string, Accumulator>();
  const byModel = new Map<string, Accumulator>();
  const byUser = new Map<string, Accumulator>();
  /** Per user: the day label to that day's spend, which is what the anomaly scan reads. */
  const userDailyUsd = new Map<string, Map<string, number>>();

  for (const bucket of buckets) {
    const cost = bucketCostUsd(bucket);

    add(totals, bucket, cost);
    add(upsert(byDay, bucket.day), bucket, cost);
    add(upsert(byModel, bucket.modelId), bucket, cost);
    add(upsert(byUser, bucket.userId), bucket, cost);

    const days = userDailyUsd.get(bucket.userId) ?? new Map<string, number>();
    days.set(bucket.day, (days.get(bucket.day) ?? 0) + (cost ?? 0));
    userDailyUsd.set(bucket.userId, days);
  }

  const users: CostByUserDto[] = [...byUser.entries()].map(([userId, accumulator]) => {
    const days = userDailyUsd.get(userId) ?? new Map<string, number>();
    const todayUsd = days.get(today) ?? 0;
    // Today is excluded from its own baseline — comparing a day against a
    // median that includes it is how a large enough spike hides itself.
    const baselineUsd = [...days.entries()].filter(([day]) => day !== today).map(([, usd]) => usd);

    return {
      ...toBucketDto(accumulator),
      userId,
      todayUsd: round(todayUsd),
      anomaly: describeAnomaly(detectSpendAnomaly({ baselineUsd, todayUsd })),
    };
  });

  // Anomalies first, then spend. An operator opening this page is looking for
  // the thing that changed, not the biggest customer.
  users.sort((left, right) => {
    if (left.anomaly.anomalous !== right.anomaly.anomalous) {
      return left.anomaly.anomalous ? -1 : 1;
    }
    return (right.costUsd ?? 0) - (left.costUsd ?? 0);
  });

  const daily: CostByDayDto[] = [...byDay.entries()]
    .map(([day, accumulator]) => ({ ...toBucketDto(accumulator), day }))
    .sort((left, right) => (left.day < right.day ? 1 : -1));

  const models: CostByModelDto[] = [...byModel.entries()]
    .map(([modelId, accumulator]) => ({
      ...toBucketDto(accumulator),
      modelId,
      priced: isModelId(modelId),
    }))
    .sort((left, right) => (right.costUsd ?? 0) - (left.costUsd ?? 0));

  return {
    windowDays: params.windowDays,
    generatedAt: now.toISOString(),
    truncated: buckets.length >= MAX_BUCKETS,
    totals: toBucketDto(totals),
    byDay: daily,
    byModel: models,
    topUsers: users.slice(0, TOP_USER_LIMIT),
  };
}

function upsert(map: Map<string, Accumulator>, key: string): Accumulator {
  const existing = map.get(key);
  if (existing !== undefined) return existing;
  const created = emptyAccumulator();
  map.set(key, created);
  return created;
}

/** Users flagged by the scan, whatever their rank. This is what the alert reads. */
export function anomalousUsers(report: CostReportResponse): CostByUserDto[] {
  return report.topUsers.filter((user) => user.anomaly.anomalous);
}
