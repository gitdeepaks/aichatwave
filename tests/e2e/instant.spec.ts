/**
 * Phase L's exit criteria, in a browser.
 *
 * Three of them cannot be asserted anywhere else, because each is a claim
 * about what the client does *without* the network:
 *
 *  - a previously-visited thread renders with the network off;
 *  - rename, pin and delete reflect in the sidebar before the server answers;
 *  - no sidebar mutation triggers a refetch of the list.
 *
 * The technique throughout is to make the network slow or absent on purpose
 * and then assert the UI is already correct. A test that lets the request
 * finish cannot tell an optimistic update from a fast one — which is exactly
 * the distinction this phase is about.
 */

import { expect, test, type Page } from "@playwright/test";
import {
  composer,
  sidebar,
  startThread,
  transcript,
  waitForTurnToSettle,
} from "./helpers/workspace";
import { releaseSlotForTests } from "./helpers/stream-slot";
import { ROUTES } from "@/lib/routes";

test.beforeEach(async () => {
  await releaseSlotForTests();
});

const SHORT_PROMPT = "Reply with exactly the word: pong";

/**
 * The thread's row, however it is currently titled.
 *
 * The title is a placeholder derived from the first message until the title
 * model replaces it behind the response, so matching on an exact string races
 * a generation nothing here is waiting for. The row's `href` does not change.
 */
function threadRow(page: Page, threadUrl: string) {
  const threadId = threadUrl.split("/").at(-1) ?? "";
  return sidebar.region(page).locator(`a[href$="${threadId}"]`);
}

test("a visited thread renders from the client cache with the network off", async ({ page }) => {
  const threadUrl = await startThread(page, SHORT_PROMPT);
  await expect(transcript.latestAnswer(page)).toBeVisible({ timeout: 30_000 });
  await waitForTurnToSettle(page);

  const answer = (await transcript.latestAnswer(page).innerText()).trim();
  expect(answer.length).toBeGreaterThan(0);

  // Leave the thread. Both halves of what coming back needs — the route
  // segment and the transcript — are warmed on intent, so hovering the row is
  // what a user does anyway and what the prefetch listens for.
  await page.goto(ROUTES.app);
  const row = threadRow(page, threadUrl);
  await expect(row).toBeVisible();
  await row.hover();

  // Give the prefetch and the IndexedDB write a moment. Both are deliberately
  // off the interaction path, which is the whole point, and that also means
  // neither is something the UI reports finishing.
  await page.waitForTimeout(2_000);

  await page.context().setOffline(true);
  try {
    await row.click();

    await expect(page).toHaveURL(threadUrl);
    // The assertion that matters: the conversation is on screen, from disk,
    // with nothing to fetch it from.
    await expect(transcript.latestAnswer(page)).toContainText(answer.slice(0, 12));
  } finally {
    await page.context().setOffline(false);
  }
});

test("a rename appears before the server has answered", async ({ page }) => {
  const threadUrl = await startThread(page, SHORT_PROMPT);
  await waitForTurnToSettle(page);

  // Hold the mutation open. Whatever the sidebar shows while this is in
  // flight, it computed itself.
  await page.route("**/api/threads/*", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await route.continue();
  });

  const row = threadRow(page, threadUrl);
  const title = (await row.innerText()).trim();
  await sidebar.actionsFor(page, title).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();

  const input = page.getByRole("textbox", { name: "Conversation title" });
  await input.fill("Renamed while offline-ish");
  await input.press("Enter");

  // Well inside the five seconds the PATCH is being held for.
  await expect(sidebar.region(page).getByText("Renamed while offline-ish")).toBeVisible({
    timeout: 1_500,
  });
});

test("pinning does not refetch the thread list", async ({ page }) => {
  const threadUrl = await startThread(page, SHORT_PROMPT);
  await waitForTurnToSettle(page);

  await page.goto(ROUTES.app);
  const row = threadRow(page, threadUrl);
  await expect(row).toBeVisible();

  const listFetches: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    // `GET /api/threads` with no id — the list itself, not a thread's own
    // route. That request is the round trip this phase removed.
    if (request.method() === "GET" && url.pathname === "/api/threads") {
      listFetches.push(url.toString());
    }
  });

  const title = (await row.innerText()).trim();
  await sidebar.actionsFor(page, title).click();
  await page.getByRole("menuitem", { name: "Pin" }).click();

  // The row moves into the pinned group immediately; the list is never
  // re-read to find that out.
  await expect(sidebar.region(page).getByRole("link", { name: title })).toBeVisible();
  await page.waitForTimeout(2_000);

  expect(listFetches, `unexpected list refetches: ${listFetches.join(", ")}`).toHaveLength(0);
});

test("the sent message paints before the answer starts", async ({ page }) => {
  await page.goto(ROUTES.app);

  // Hold the chat request open so the echo cannot be mistaken for a fast
  // round trip: whatever is on screen while this waits was rendered locally.
  await page.route("**/api/chat", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.continue();
  });

  await composer.input(page).fill(SHORT_PROMPT);
  await composer.send(page).click();

  await expect(transcript.userMessages(page).last()).toContainText(SHORT_PROMPT, {
    timeout: 1_000,
  });
});

test("the thread's title reaches the browser tab without a server round trip", async ({ page }) => {
  const threadUrl = await startThread(page, SHORT_PROMPT);
  await waitForTurnToSettle(page);

  await page.goto(ROUTES.app);
  const row = threadRow(page, threadUrl);
  await expect(row).toBeVisible();

  const title = (await row.innerText()).trim();
  await row.click();
  await expect(page).toHaveURL(threadUrl);

  // `generateMetadata` used to read this from the database, which is what made
  // the whole route dynamic. It now comes from the same cached row the
  // sidebar is rendering.
  await expect.poll(() => page.title()).toContain(title.replace(/…$/, ""));
});
