/**
 * Every selector the E2E suite depends on, in one module.
 *
 * The chat transcript is rendered by `components/ai-elements/`, which is
 * vendored CLI output — its class names are not a contract and a regeneration
 * may change them. Naming them once here means a regeneration is one edit and
 * a failing locator, rather than six specs quietly asserting nothing.
 *
 * Roles and accessible names are preferred wherever the markup offers one,
 * because those are what Phase J's accessibility work made stable on purpose:
 * a locator that breaks when the accessible name changes is a locator that
 * notices an accessibility regression.
 */

import { expect, type Locator, type Page } from "@playwright/test";
import { ROUTES } from "@/lib/routes";

export const composer = {
  input: (page: Page): Locator => page.getByPlaceholder(/Message AIChatWave/i),
  send: (page: Page): Locator => page.getByRole("button", { name: "Send message" }),
  stop: (page: Page): Locator => page.getByRole("button", { name: "Stop generating" }),
};

export const transcript = {
  region: (page: Page): Locator => page.getByRole("log", { name: "Conversation" }),
  /** `.is-assistant` / `.is-user` are the class hooks `Message` renders per role. */
  assistantMessages: (page: Page): Locator => page.locator(".is-assistant"),
  userMessages: (page: Page): Locator => page.locator(".is-user"),
  /**
   * The answer to the message that was just sent.
   *
   * `.last()`, never `.first()`: a thread can hold more than one turn — the
   * retry in `startThread` re-sends into the same thread when the first
   * attempt is refused a stream slot — and the newest answer is the one an
   * assertion about "the reply" means.
   */
  latestAnswer: (page: Page): Locator => page.locator(".is-assistant").last(),
};

export const sidebar = {
  region: (page: Page): Locator => page.getByRole("navigation", { name: "Conversations" }),
  threadLink: (page: Page, title: string): Locator =>
    page.getByRole("navigation", { name: "Conversations" }).getByRole("link", { name: title }),
  actionsFor: (page: Page, title: string): Locator =>
    page.getByRole("button", { name: `Actions for ${title}` }),
};

/**
 * Sends a message from the workspace root and returns the thread URL it landed
 * on.
 *
 * A new thread's id is minted server-side by `app/app/page.tsx` and the
 * composer pushes the route *after* the first send, so the URL is not knowable
 * before this returns.
 */
export async function startThread(page: Page, message: string): Promise<string> {
  await page.goto(ROUTES.app);

  for (let attempt = 1; attempt <= STREAM_SLOT_ATTEMPTS; attempt += 1) {
    await composer.input(page).fill(message);
    await composer.send(page).click();
    await page.waitForURL(/\/app\/chat\/.+/);

    if (await turnStarted(page)) return page.url();

    // Refused a stream slot rather than broken. Wait out the lease and send
    // again into the same thread.
    //
    // The wait for `send` is what keeps the retry from hanging: while a turn
    // is in flight the composer shows stop *instead of* send, so clicking a
    // send button that is not there burns the whole test timeout.
    await page.waitForTimeout(STREAM_SLOT_RETRY_MS);
    await expect(composer.send(page)).toBeVisible({ timeout: 60_000 });
  }

  throw new Error(
    `No turn started after ${STREAM_SLOT_ATTEMPTS} attempts. The free plan allows ` +
      `${1} concurrent stream and an abandoned turn holds its lease for up to five minutes ` +
      `(STREAM_LEASE_TTL_MS), so a killed run can starve the next one. Wait for the lease to ` +
      `expire, or run against a database this suite has to itself.`,
  );
}

/**
 * How many times to re-send into a thread whose first attempt was refused.
 *
 * `PLAN_LIMITS.free.concurrentStreams` is **1**, and a turn keeps running after
 * its client disconnects — that is what makes a refresh resumable — so a run
 * that was killed mid-stream holds the account's only slot until the lease
 * expires. On CI, where the database is a fresh service container, this never
 * fires. On a laptop pointed at a shared development branch it is routine, and
 * the alternative is a suite that fails for a reason that has nothing to do
 * with the code under test.
 */
const STREAM_SLOT_ATTEMPTS = 3;
const STREAM_SLOT_RETRY_MS = 20_000;

/** Whether the turn actually began, as opposed to being refused a stream slot. */
async function turnStarted(page: Page): Promise<boolean> {
  const evidence = composer.stop(page).or(transcript.assistantMessages(page).first()).first();
  try {
    await expect(evidence).toBeVisible({ timeout: 45_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Waits for the turn to finish.
 *
 * The stop button exists only while a turn is in flight — `chat-composer.tsx`
 * swaps it for send rather than showing both — so its disappearance is the
 * signal that generation ended, whether it ended by completing or by being
 * stopped.
 */
export async function waitForTurnToSettle(page: Page): Promise<void> {
  await expect(composer.stop(page)).toBeHidden({ timeout: 60_000 });
  await expect(composer.send(page)).toBeVisible();
}

/** Deletes a thread through the sidebar menu. No confirmation dialog exists. */
export async function deleteThread(page: Page, title: string): Promise<void> {
  await sidebar.actionsFor(page, title).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
}
