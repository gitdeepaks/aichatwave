/**
 * axe-core over every route, public and authenticated. Phase K item 6.
 *
 * Phase J ran this by hand and reached zero violations on six routes, then
 * recorded the gap honestly: nothing in CI would catch the seventh, and one
 * surface — a thread page with a live conversation — was never audited at all,
 * because auditing it needs a signed-in session. That session is what Phase K
 * item 5 built, which is why these two items had to close together.
 *
 * No tag filter. axe's full default rule set runs, not just WCAG A/AA, because
 * that is what Phase J's "zero violations" claim was measured with and a gate
 * that is weaker than the claim it protects is not a gate.
 *
 * Every audit runs once per theme (Phase L2 exit criterion: "axe-core still
 * reports 0 violations on every route, in both themes"). The theme is pinned
 * with the same cookie the appearance menu writes, so the server renders the
 * page in that theme from the first byte — which is also what a reader gets.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { composer, startThread, transcript, waitForTurnToSettle } from "./helpers/workspace";
import { THEME_COOKIE, THEMES, type Theme } from "@/lib/appearance";
import { ROUTES } from "@/lib/routes";

async function pinTheme(page: Page, theme: Theme, baseURL: string | undefined): Promise<void> {
  if (baseURL === undefined) throw new Error("Playwright's baseURL is not configured");
  await page.context().addCookies([{ name: THEME_COOKIE, value: theme, url: baseURL }]);
}

/**
 * Runs axe and fails with something a human can act on.
 *
 * Playwright's default diff on an array of violation objects is several
 * hundred lines of serialised DOM. The rule id, the impact and the first
 * offending selector are what actually get the defect fixed.
 */
async function expectNoViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();

  const summary = results.violations.map((violation) => {
    const where = violation.nodes
      .slice(0, 3)
      .map((node) => node.target.join(" "))
      .join(", ");
    return `${violation.impact ?? "unknown"}: ${violation.id} — ${violation.help} [${where}]`;
  });

  expect(summary, `axe violations on ${label}`).toEqual([]);
}

for (const theme of THEMES) {
  test.describe(`public routes, ${theme} theme`, () => {
    // Signed out, which is how a stranger meets these pages. The project-level
    // storage state would otherwise sign this browser in and redirect `/sign-in`.
    test.use({ storageState: { cookies: [], origins: [] } });
    test.beforeEach(async ({ page, baseURL }) => {
      await pinTheme(page, theme, baseURL);
    });

    for (const route of [ROUTES.home, ROUTES.pricing, ROUTES.signIn] as const) {
      test(`${route} has no accessibility violations in ${theme}`, async ({ page }) => {
        await page.goto(route);
        await expectNoViolations(page, `${route} (${theme})`);
      });
    }
  });

  test.describe(`authenticated routes, ${theme} theme`, () => {
    test.beforeEach(async ({ page, baseURL }) => {
      await pinTheme(page, theme, baseURL);
    });

    for (const route of [ROUTES.app, ROUTES.memories, ROUTES.profile] as const) {
      test(`${route} has no accessibility violations in ${theme}`, async ({ page }) => {
        await page.goto(route);
        // Auditing before the client-side data lands measures a skeleton and
        // reports defects the user never sees — `page-has-heading-one` against a
        // page whose heading is one fetch away, for instance.
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expectNoViolations(page, `${route} (${theme})`);
      });
    }

    /**
     * The surface Phase J could not reach.
     *
     * A thread page renders the transcript, the live-region announcer, the
     * message actions and the attribution row — the densest markup in the
     * product, and the only markup that is generated rather than written.
     */
    test(`a thread page with a live transcript has no accessibility violations in ${theme}`, async ({
      page,
    }) => {
      await startThread(page, "Reply with exactly the word: pong");
      await expect(transcript.latestAnswer(page)).toBeVisible({ timeout: 30_000 });

      // Audited mid-stream as well as after, because the announcer and the
      // streaming status bar only exist while a turn is in flight and they are
      // the parts most likely to announce wrongly.
      await expectNoViolations(page, `thread page, streaming (${theme})`);

      await waitForTurnToSettle(page);
      await expectNoViolations(page, `thread page, settled (${theme})`);
    });

    test(`the command palette has no accessibility violations in ${theme}`, async ({ page }) => {
      await page.goto(ROUTES.app);
      // Sent to the document rather than to the composer: the listener is on
      // `window`, and the composer's own key handler owns Enter and Escape.
      await expect(composer.input(page)).toBeVisible();
      await page.keyboard.press("ControlOrMeta+k");
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoViolations(page, `command palette (${theme})`);
    });
  });
}
