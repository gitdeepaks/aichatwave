import { z } from "zod";
import type { SloReportResponse } from "@/lib/api/contracts";
import { requireAdminUserId } from "@/server/auth/admin";
import {
  createPublicRouteHandler,
  jsonResponse,
  noBody,
  noParams,
} from "@/server/lib/route-handler";
import { buildSloReport } from "@/server/observability/slo-service";

/**
 * An hour. Long enough for the rates to be meaningful, and it is also the
 * depth of the in-process counter ring — asking for more would return a window
 * the two instance-scoped objectives cannot actually fill.
 */
const DEFAULT_WINDOW_MINUTES = 60;

const sloQuerySchema = z.object({
  windowMinutes: z.coerce.number().int().min(5).max(60).optional(),
});

/** Current standing against every objective in `lib/observability/slo.ts`. */
export const GET = createPublicRouteHandler({
  name: "GET /api/admin/slo",
  params: noParams,
  query: sloQuerySchema,
  body: noBody,
  handler: async ({ query, log }) => {
    await requireAdminUserId(log);

    const report: SloReportResponse = await buildSloReport({
      windowMinutes: query.windowMinutes ?? DEFAULT_WINDOW_MINUTES,
      log,
    });

    // 503 when something is paging, so a monitor pointed here needs no body
    // parsing to know the answer — the same contract `/api/health` already uses.
    return jsonResponse(report, report.paging ? 503 : 200);
  },
});
