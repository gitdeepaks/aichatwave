/**
 * The path a user actually takes: send, stream, stop, resume, delete.
 *
 * Phase K item 5. Every assertion here is one the integration suite cannot
 * make, because each depends on the browser, the middleware and a real
 * streaming response existing at the same time.
 *
 * These tests spend real provider tokens. They use the default model
 * (`gpt-5-nano`, the cheapest in the registry) and ask for one-word answers,
 * so a full run costs a fraction of a cent. That is deliberate: a suite that
 * stubs the provider cannot tell you that streaming works.
 */

import { expect, test } from "@playwright/test";
import {
  composer,
  deleteThread,
  sidebar,
  startThread,
  transcript,
  waitForTurnToSettle,
} from "./helpers/workspace";
import { releaseSlotForTests } from "./helpers/stream-slot";
import { ROUTES } from "@/lib/routes";

/**
 * Hand the next test a free stream slot.
 *
 * The free plan allows one concurrent stream and a turn outlives its client,
 * so the previous test's answer can still be generating when this one sends.
 * See `helpers/stream-slot.ts` for why settling it is correct rather than a
 * workaround.
 */
test.beforeEach(async () => {
  await releaseSlotForTests();
});

/** Short prompts keep the token bill and the wall-clock time down. */
const SHORT_PROMPT = "Reply with exactly the word: pong";
const LONG_PROMPT = "Count slowly from 1 to 40, one number per line.";

test("streams an answer and persists it across a reload", async ({ page }) => {
  await startThread(page, SHORT_PROMPT);

  // The user's own message must paint without waiting for the model.
  await expect(transcript.userMessages(page).last()).toContainText("pong");

  await expect(transcript.latestAnswer(page)).toBeVisible({ timeout: 30_000 });
  await waitForTurnToSettle(page);

  const answer = await transcript.latestAnswer(page).innerText();
  expect(answer.trim().length).toBeGreaterThan(0);

  // Phase A's owned `message` table, not the checkpoint blob, is what has to
  // serve this. A reload that loses the turn means the write never happened.
  await page.reload();
  await expect(transcript.latestAnswer(page)).toContainText(answer.trim().slice(0, 12));
});

test("stops a stream on demand", async ({ page }) => {
  await startThread(page, LONG_PROMPT);

  // Wait for the answer to actually begin before stopping it. Clicking the
  // moment the button appears can beat the first token, which tests the
  // button's existence rather than its effect.
  await expect(transcript.latestAnswer(page)).toBeVisible({ timeout: 30_000 });

  const stop = composer.stop(page);
  await expect(stop).toBeVisible();
  await stop.click();

  await waitForTurnToSettle(page);
});

/**
 * Known-broken, and recorded as such in `docs/runbook.md`: stopping a stream
 * loses the turn. No messages are written, so the question and the generated
 * text both disappear, while the `HumanMessage` stays in the LangGraph
 * checkpoint — which is why the *next* turn sees a question the transcript
 * does not show.
 *
 * Written as a failing expectation rather than left out, so that whoever fixes
 * it finds the assertion already here and deletes one word instead of guessing
 * what the fix was supposed to achieve.
 */
test.fixme("a stopped turn keeps the text it had already produced", async ({ page }) => {
  await startThread(page, LONG_PROMPT);
  await expect(transcript.latestAnswer(page)).toBeVisible({ timeout: 30_000 });

  const partial = await transcript.latestAnswer(page).innerText();
  await composer.stop(page).click();
  await waitForTurnToSettle(page);

  await page.reload();
  await expect(transcript.latestAnswer(page)).toContainText(partial.trim().slice(0, 8));
});

test("resumes a stream after a reload", async ({ page }) => {
  const threadUrl = await startThread(page, LONG_PROMPT);

  // Reload *while the turn is live*. Phase G made the turn outlive its client
  // precisely so this works; before that, closing the tab ended generation.
  await expect(composer.stop(page)).toBeVisible({ timeout: 30_000 });
  await page.goto(threadUrl);

  // The reconnected client either rejoins the live stream or reads the
  // finished turn — both are correct, and both end with content and a settled
  // composer. What would be wrong is an empty transcript.
  await expect(transcript.latestAnswer(page)).toBeVisible({ timeout: 30_000 });
  await waitForTurnToSettle(page);
  await expect(transcript.latestAnswer(page)).not.toBeEmpty();
});

test("deletes a thread and navigates away from it", async ({ page }) => {
  const threadUrl = await startThread(page, SHORT_PROMPT);
  await waitForTurnToSettle(page);

  // The sidebar titles the thread from its first turn, asynchronously, so the
  // link is located by the thread's own href rather than by a title that may
  // still be "New chat" when this runs.
  const threadId = new URL(threadUrl).pathname.split("/").at(-1) ?? "";
  expect(threadId.length).toBeGreaterThan(0);

  const link = sidebar.region(page).locator(`a[href$="${threadId}"]`);
  await expect(link).toBeVisible({ timeout: 30_000 });

  const title = (await link.innerText()).trim();
  await deleteThread(page, title);

  await expect(link).toBeHidden({ timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(`${ROUTES.app}$`));
});
