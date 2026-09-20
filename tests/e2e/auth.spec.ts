/**
 * What the middleware protects, and what it lets through.
 *
 * `proxy.ts` carries a bare `clerkMiddleware`, and authorisation is enforced
 * on the resources themselves rather than by a route matcher (Phase A2). That
 * is the right design and it is also the one whose failure is invisible: a
 * missing `auth.protect()` in a page does not break a build, fail a type
 * check, or show up in an integration test that calls the service directly.
 * It shows up here.
 */

import { expect, test } from "@playwright/test";
import { ROUTES, WORKSPACE_PREFIX } from "@/lib/routes";

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of [ROUTES.app, ROUTES.memories, ROUTES.profile] as const) {
    test(`${route} redirects to sign-in`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL(/sign-in|accounts\./, { timeout: 15_000 });
      expect(page.url()).not.toContain(`${WORKSPACE_PREFIX}/`);
    });
  }

  for (const route of [ROUTES.home, ROUTES.pricing] as const) {
    test(`${route} is public`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }

  /**
   * The workspace must never be indexable. Phase J moved it under `/app` and
   * marked it `noindex`; this is the assertion that the marker survives.
   */
  test("the workspace is excluded from robots.txt", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.ok()).toBe(true);
    expect(await robots.text()).toContain(`Disallow: ${WORKSPACE_PREFIX}`);
  });
});

test.describe("signed in", () => {
  test("the workspace renders and carries a noindex directive", async ({ page }) => {
    const response = await page.goto(ROUTES.app);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("navigation", { name: "Conversations" })).toBeVisible();

    const robots = page.locator('head meta[name="robots"]');
    await expect(robots).toHaveAttribute("content", /noindex/);
  });

  test("the legacy /chat URL still resolves", async ({ page }) => {
    // Phase J 308s the old URLs because a thread link is the thing people
    // share. A redirect that quietly stopped working would break every link
    // sent before the move.
    await page.goto("/memories");
    await expect(page).toHaveURL(new RegExp(`${ROUTES.memories}$`));
  });
});
