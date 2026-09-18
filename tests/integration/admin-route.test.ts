/**
 * `/api/admin/*` — the allowlist, and the shape of the refusal.
 *
 * These routes are built on `createPublicRouteHandler` and gated by
 * `requireAdminUserId`, which is a distinction that is easy to get wrong in
 * both directions: the session-based factory would admit any signed-in user,
 * and the refusal is deliberately a 404 rather than a 403 so the surface is not
 * advertised to whoever just probed it. Both properties are asserted here.
 */

import assert from "node:assert/strict";
import { TEST_ADMIN_USER_ID, findLogLine, signInAs, signOut } from "../helpers/environment";
import { dbTest, setupTestDatabase } from "../helpers/database";
import { seedUser } from "../helpers/seed";
import { apiRequest, callRoute, expectAppError, readJson } from "../helpers/http";
import { costReportResponseSchema, sloReportResponseSchema } from "@/lib/api/contracts";

setupTestDatabase();

const costsRoute = () => import("@/app/api/admin/costs/route");
const sloRoute = () => import("@/app/api/admin/slo/route");

dbTest("an anonymous request to the cost report is 401", async () => {
  signOut();
  const { GET } = await costsRoute();

  await expectAppError(await callRoute(GET, apiRequest("GET", "/api/admin/costs")), "UNAUTHORIZED");
});

dbTest("a signed-in non-admin is refused with 404, not 403", async () => {
  const user = await seedUser({});
  signInAs(user.id);

  const { GET } = await costsRoute();
  const response = await callRoute(GET, apiRequest("GET", "/api/admin/costs"));

  const error = await expectAppError(response, "NOT_FOUND");
  // Nothing in the refusal hints that an admin surface is behind it.
  assert.equal(error.message, "Not found.");
  // The real reason is still recorded, so a locked-out operator can find it.
  assert.equal(findLogLine("admin.access_denied")?.context?.["userId"], user.id);
});

dbTest("an allowlisted admin gets the cost report", async () => {
  await seedUser({ id: TEST_ADMIN_USER_ID });
  signInAs(TEST_ADMIN_USER_ID);

  const { GET } = await costsRoute();
  const response = await callRoute(GET, apiRequest("GET", "/api/admin/costs?windowDays=7"));

  assert.equal(response.status, 200);
  costReportResponseSchema.parse(await readJson(response));
});

dbTest("the SLO report is allowlisted too, and reports its own scope", async () => {
  await seedUser({ id: TEST_ADMIN_USER_ID });

  const { GET } = await sloRoute();

  const stranger = await seedUser({});
  signInAs(stranger.id);
  await expectAppError(await callRoute(GET, apiRequest("GET", "/api/admin/slo")), "NOT_FOUND");

  signInAs(TEST_ADMIN_USER_ID);
  const response = await callRoute(GET, apiRequest("GET", "/api/admin/slo"));

  // 200 when nothing is paging, 503 when something is — the contract a monitor
  // pointed at this route relies on, and either is a valid report.
  assert.ok([200, 503].includes(response.status), `unexpected status ${response.status}`);
  sloReportResponseSchema.parse(await readJson(response));
});

dbTest("an out-of-range window is 400 before any work is done", async () => {
  await seedUser({ id: TEST_ADMIN_USER_ID });
  signInAs(TEST_ADMIN_USER_ID);

  const { GET } = await sloRoute();
  await expectAppError(
    await callRoute(GET, apiRequest("GET", "/api/admin/slo?windowMinutes=600")),
    "INVALID_REQUEST",
  );
});
