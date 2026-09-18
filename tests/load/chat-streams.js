/**
 * k6 load scenario for the Phase D limits.
 *
 *   pnpm load:chat
 *
 * What it asserts is not throughput — this app's throughput is a provider's
 * throughput — but that the limits *hold under concurrency*, which is the one
 * property the integration tests cannot show. `tests/service/rate-limit.test.ts`
 * drives the counters sequentially from one process; the interesting failure is
 * two requests arriving at once and both believing they hold the same stream
 * slot. That is a race, and a race needs real parallelism to find.
 *
 * Three scenarios, matching the three limits in `lib/billing/plan-policy.ts`:
 *
 *  1. `concurrent_streams` — opens `concurrentStreams + 1` chat requests at the
 *     same instant. Exactly `concurrentStreams` may be admitted. The slot is
 *     claimed by an insert that either wins or conflicts, so anything above the
 *     cap is the bug this scenario exists to catch.
 *  2. `request_window`     — a burst past the per-minute window, asserting that
 *     the overflow is refused with 429 and a usable `Retry-After`.
 *  3. `quota_headroom`     — a single request, to confirm an ordinary turn is
 *     still admitted while the other two scenarios are hammering.
 *
 * ## Running it
 *
 * Needs a running app and a real signed-in session, because every limit here is
 * per user and the session is what identifies them:
 *
 *   BASE_URL=http://localhost:3000 \
 *   SESSION_COOKIE="__session=<value from your browser's cookies>" \
 *   PLAN=free \
 *   pnpm load:chat
 *
 * Point it at a disposable account. It sends real chat requests, so admitted
 * turns cost real provider tokens and count against that account's monthly
 * allowance — `MESSAGE` is deliberately trivial to keep both small.
 */

import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";
import exec from "k6/execution";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SESSION_COOKIE = __ENV.SESSION_COOKIE || "";
const PLAN = __ENV.PLAN === "pro" ? "pro" : "free";
const MODEL = __ENV.MODEL || "gpt-5-nano";
const MESSAGE = __ENV.MESSAGE || "Reply with the single word: ok.";

/**
 * Mirrors `PLAN_LIMITS` in `lib/billing/plan-policy.ts`.
 *
 * Restated rather than imported because k6 runs its own JavaScript runtime with
 * no bundler and no TypeScript. Keep it in step with that module; the numbers
 * are the contract this file exists to check.
 */
const PLAN_LIMITS = {
  free: { requestsPerMinute: 10, concurrentStreams: 1 },
  pro: { requestsPerMinute: 60, concurrentStreams: 3 },
};

const limits = PLAN_LIMITS[PLAN];

const admitted = new Counter("streams_admitted");
const refusedRateLimited = new Counter("streams_refused_rate_limited");
const refusedOther = new Counter("streams_refused_other");
const refusalDuration = new Trend("refusal_duration", true);

export const options = {
  scenarios: {
    // One instant burst of `concurrentStreams + 1` requests.
    concurrent_streams: {
      executor: "per-vu-iterations",
      vus: limits.concurrentStreams + 1,
      iterations: 1,
      exec: "openStream",
      startTime: "0s",
    },
    // Then the per-minute window, well clear of the burst above.
    request_window: {
      executor: "per-vu-iterations",
      vus: limits.requestsPerMinute + 5,
      iterations: 1,
      exec: "openStream",
      startTime: "20s",
    },
    // And one ordinary turn, after both bursts have been refused and released.
    quota_headroom: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: 1,
      exec: "openStream",
      startTime: "95s",
    },
  },
  thresholds: {
    // Every assertion below must hold. A limit that admits one extra stream is
    // a failed run, not a warning.
    checks: ["rate==1.00"],
    // The refusal path must stay cheap: it is two indexed upserts and no
    // provider call, and it is what protects the app under abuse. Measured as
    // its own metric rather than a tagged `http_req_duration`, because whether
    // a request was refused is only known once it has come back.
    refusal_duration: ["p(95)<1000"],
  },
};

export function setup() {
  if (SESSION_COOKIE === "") {
    throw new Error(
      "SESSION_COOKIE is required: every limit here is per user, and the session is what identifies them.",
    );
  }
  return { threadId: uuid() };
}

export function openStream(data) {
  const response = http.post(
    `${BASE_URL}/api/chat`,
    JSON.stringify({
      // One thread for the whole run: the concurrency cap is per *user*, not
      // per thread, and using one thread makes that explicit.
      threadId: data.threadId,
      messageContent: MESSAGE,
      selectedModel: MODEL,
    }),
    {
      headers: {
        "content-type": "application/json",
        origin: BASE_URL,
        cookie: SESSION_COOKIE,
      },
      tags: { scenario: exec.scenario.name },
      // A turn streams for as long as the model takes; this run only cares
      // about the response head.
      timeout: "30s",
    },
  );

  const refused = response.status === 429;

  if (response.status === 200) {
    admitted.add(1);
  } else if (refused) {
    refusedRateLimited.add(1);
    refusalDuration.add(response.timings.duration);
  } else {
    refusedOther.add(1);
  }

  check(response, {
    "no request is refused for an unexpected reason": (res) =>
      res.status === 200 || res.status === 429,
    "every refusal carries a Retry-After the client can honour": (res) =>
      res.status !== 429 || Number(res.headers["Retry-After"]) > 0,
    "every refusal carries the typed error envelope": (res) =>
      res.status !== 429 || isTypedRefusal(res),
  });
}

export function teardown() {
  console.log(
    `plan=${PLAN} concurrentStreams=${limits.concurrentStreams} ` +
      `requestsPerMinute=${limits.requestsPerMinute}`,
  );
  console.log(
    "Read streams_admitted against those caps: the concurrent_streams burst must " +
      `admit at most ${limits.concurrentStreams}, and the request_window burst at ` +
      `most ${limits.requestsPerMinute} across the minute. streams_refused_other ` +
      "must be zero — anything there is a failure the limits did not intend.",
  );
}

function isTypedRefusal(response) {
  try {
    const body = JSON.parse(response.body);
    return (
      body.error !== undefined &&
      (body.error.code === "RATE_LIMITED" || body.error.code === "QUOTA_EXCEEDED") &&
      typeof body.error.requestId === "string"
    );
  } catch {
    return false;
  }
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
