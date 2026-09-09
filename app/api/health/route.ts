import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { HealthResponse } from "@/lib/api/contracts";
import type { Logger } from "@/server/lib/logger";
import {
  createPublicRouteHandler,
  jsonResponse,
  noBody,
  noParams,
  noQuery,
} from "@/server/lib/route-handler";

/** Module load time, used to report uptime for the current instance. */
const startedAt = Date.now();

/**
 * Liveness plus a real readiness check. Returns 503 when a dependency is down
 * so a platform health probe can pull the instance out of rotation instead of
 * routing traffic at a process that cannot serve it.
 */
export const GET = createPublicRouteHandler({
  name: "GET /api/health",
  params: noParams,
  query: noQuery,
  body: noBody,
  handler: async ({ log }) => {
    const database = await checkDatabase(log);

    const response: HealthResponse = {
      status: database === "ok" ? "ok" : "degraded",
      checks: { database },
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    };

    return jsonResponse(response, response.status === "ok" ? 200 : 503);
  },
});

async function checkDatabase(log: Logger): Promise<"ok" | "failing"> {
  try {
    await db.execute(sql`select 1`);
    return "ok";
  } catch (error) {
    log.warn("health.database_failing", {}, error);
    return "failing";
  }
}
