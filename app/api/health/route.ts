import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import type { HealthResponse } from "@/lib/api/contracts";
import { polarClient } from "@/lib/polar-client";
import { polarServer } from "@/lib/env";
import { polarErrorFacts } from "@/server/billing/polar-error";
import type { Logger } from "@/server/lib/logger";
import {
  createPublicRouteHandler,
  jsonResponse,
  noBody,
  noParams,
} from "@/server/lib/route-handler";

/** Module load time, used to report uptime for the current instance. */
const startedAt = Date.now();

const healthQuerySchema = z.object({
  /** `?deep=1` additionally probes Polar. Off by default — see below. */
  deep: z
    .enum(["0", "1"])
    .optional()
    .transform((value) => value === "1"),
});

type CheckState = "ok" | "failing" | "skipped";

/**
 * Liveness plus readiness. Returns 503 when a dependency is down so a platform
 * health probe can pull the instance out of rotation rather than route traffic
 * at a process that cannot serve it.
 *
 * The billing probe is opt-in because it costs an outbound Polar call. Point a
 * low-frequency monitor at `?deep=1` — a revoked or wrong-environment Polar
 * token otherwise stays invisible until a customer fails to check out.
 */
export const GET = createPublicRouteHandler({
  name: "GET /api/health",
  params: noParams,
  query: healthQuerySchema,
  body: noBody,
  handler: async ({ query, log }) => {
    const [database, billing] = await Promise.all([
      checkDatabase(log),
      query.deep ? checkBilling(log) : Promise.resolve<CheckState>("skipped"),
    ]);

    const healthy = database === "ok" && billing !== "failing";

    const response: HealthResponse = {
      status: healthy ? "ok" : "degraded",
      checks: { database, billing },
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    };

    return jsonResponse(response, healthy ? 200 : 503);
  },
});

async function checkDatabase(log: Logger): Promise<CheckState> {
  try {
    await db.execute(sql`select 1`);
    return "ok";
  } catch (error) {
    log.warn("health.database_failing", {}, error);
    return "failing";
  }
}

/** Cheapest authenticated read that proves the credential works. */
async function checkBilling(log: Logger): Promise<CheckState> {
  try {
    await polarClient.products.list({ limit: 1 });
    return "ok";
  } catch (error) {
    const facts = polarErrorFacts(error);
    log.error(
      "health.billing_failing",
      {
        polarServer,
        upstreamStatus: facts.upstreamStatus,
        upstreamCode: facts.upstreamCode,
        upstreamDetail: facts.upstreamDetail,
      },
      error,
    );
    return "failing";
  }
}
