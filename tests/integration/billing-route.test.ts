/**
 * `/api/billing/*` — the failure paths, which are the ones with a decision in
 * them.
 *
 * `toBillingError` splits Polar failures in two: a rejected *credential* is an
 * operator problem (503, nothing the user can do) and a rejected *request* is
 * an upstream failure the user may retry (502). Both used to surface as one
 * opaque 502, which is what made a dead token look like an application bug.
 */

import assert from "node:assert/strict";
import { signInAs, signOut } from "../helpers/environment";
import { dbTest, setupTestDatabase } from "../helpers/database";
import {
  polarAuthFailure,
  polarCalls,
  polarRequestFailure,
  resetPolarStub,
  setPolarCheckoutUrl,
  setPolarFailure,
} from "../helpers/polar-stub";
import { seedUser } from "../helpers/seed";
import { apiRequest, callRoute, expectAppError, readJson } from "../helpers/http";

setupTestDatabase();

const checkoutRoute = () => import("@/app/api/billing/checkout/route");
const portalRoute = () => import("@/app/api/billing/portal/route");

async function postCheckout() {
  const { POST } = await checkoutRoute();
  return callRoute(POST, apiRequest("POST", "/api/billing/checkout"));
}

dbTest("anonymous checkout is 401 and never reaches Polar", async () => {
  resetPolarStub();
  signOut();

  await expectAppError(await postCheckout(), "UNAUTHORIZED");
  assert.deepEqual(polarCalls, []);
});

dbTest("a checkout returns the session URL Polar handed back", async () => {
  resetPolarStub();
  const user = await seedUser({});
  signInAs(user.id);

  const response = await postCheckout();

  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), { url: "https://polar.test/checkout/test" });
  assert.deepEqual(polarCalls, ["checkouts.create"]);
});

dbTest("a rejected Polar request is 502 UPSTREAM_ERROR", async () => {
  resetPolarStub();
  setPolarFailure(polarRequestFailure());
  const user = await seedUser({});
  signInAs(user.id);

  const error = await expectAppError(await postCheckout(), "UPSTREAM_ERROR");

  // The client message never carries the vendor's wording.
  assert.equal(error.message, "Could not start checkout. Please try again.");
});

dbTest("a revoked Polar credential is 503, not 502", async () => {
  resetPolarStub();
  setPolarFailure(polarAuthFailure());
  const user = await seedUser({});
  signInAs(user.id);

  await expectAppError(await postCheckout(), "SERVICE_UNAVAILABLE");
});

dbTest("a response that fails the route's own contract is 500, not a broken body", async () => {
  resetPolarStub();
  // Polar succeeds, but hands back something that is not a URL. The route
  // parses its own response before sending it, so this is an untyped failure —
  // the only thing that becomes `INTERNAL_ERROR` — rather than a 200 carrying
  // a value the client cannot use.
  setPolarCheckoutUrl("not-a-url");
  const user = await seedUser({});
  signInAs(user.id);

  const error = await expectAppError(await postCheckout(), "INTERNAL_ERROR");
  assert.equal(error.message, "Something went wrong. Please try again.");
});

dbTest("the customer portal follows the same split", async () => {
  resetPolarStub();
  const user = await seedUser({});
  signInAs(user.id);

  const { POST } = await portalRoute();
  const ok = await callRoute(POST, apiRequest("POST", "/api/billing/portal"));
  assert.equal(ok.status, 200);
  assert.deepEqual(await readJson(ok), { url: "https://polar.test/portal" });

  setPolarFailure(polarAuthFailure());
  const failed = await callRoute(POST, apiRequest("POST", "/api/billing/portal"));
  await expectAppError(failed, "SERVICE_UNAVAILABLE");
});
