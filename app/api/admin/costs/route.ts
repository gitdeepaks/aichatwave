import { costReportQuerySchema, type CostReportResponse } from "@/lib/api/contracts";
import { requireAdminUserId } from "@/server/auth/admin";
import {
  createPublicRouteHandler,
  jsonResponse,
  noBody,
  noParams,
} from "@/server/lib/route-handler";
import { anomalousUsers, buildCostReport } from "@/server/observability/cost-service";

/** A month reads as "this billing period" without being long enough to be slow. */
const DEFAULT_WINDOW_DAYS = 30;

/**
 * Spend per user, per model, and per day.
 *
 * Built on `createPublicRouteHandler` and gated by `requireAdminUserId` rather
 * than on `createRouteHandler`, because the two checks are not the same: the
 * session check would let any signed-in user through, and this route must
 * refuse everyone who is not on the allowlist — with a 404, so its existence
 * is not advertised.
 */
export const GET = createPublicRouteHandler({
  name: "GET /api/admin/costs",
  params: noParams,
  query: costReportQuerySchema,
  body: noBody,
  handler: async ({ query, log }) => {
    const userId = await requireAdminUserId(log);

    const report: CostReportResponse = await buildCostReport({
      windowDays: query.days ?? DEFAULT_WINDOW_DAYS,
    });

    const flagged = anomalousUsers(report);
    if (flagged.length > 0) {
      // Logged from the read path on purpose: there is no cron in this app, so
      // the scan runs when someone looks. That is honest — it is a dashboard,
      // not a monitor — and the line is what a log-based alert rule matches on
      // until one exists.
      log.warn("cost.anomaly_detected", {
        adminUserId: userId,
        users: flagged.length,
        topUserId: flagged[0]?.userId,
        topTodayUsd: flagged[0]?.todayUsd,
      });
    }

    return jsonResponse(report);
  },
});
