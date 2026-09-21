/**
 * Generating a thread's real title from its first exchange.
 *
 * Runs behind the response, never on the request path: the user is reading the
 * answer, so a second model call costs them nothing, and the sidebar label is
 * not worth a millisecond of time-to-first-token.
 *
 * Separate from `thread-title.ts` because this module reaches for provider
 * credentials through `server/ai/model-service`, and the string handling next
 * door has to stay importable without a configured environment.
 */

import { configuredProviders } from "@/lib/env";
import { isModelAvailable, type ModelId } from "@/lib/ai/model-registry";
import { getDynamicModel } from "@/server/ai/model-service";
import {
  isPlaceholderTitle,
  normalizeGeneratedTitle,
  truncateForTitlePrompt,
} from "@/lib/chat/thread-title";
import { findThreadForUser, updateThread } from "@/server/db/thread-repository";
import { logger as rootLogger, type Logger } from "@/server/lib/logger";

/**
 * The cheapest model in the registry is the right one for this: the task is
 * summarising two paragraphs into five words, and spending a frontier model's
 * per-token rate on it would make titling cost more than some answers.
 */
const TITLE_MODEL_ID: ModelId = "gpt-5-nano";

const TITLE_PROMPT = [
  "Write a title for this conversation.",
  "Rules: 2 to 6 words. No quotation marks, no trailing punctuation, no prefix such as",
  '"Title:". Use the language the user wrote in. Describe the subject, not the exchange —',
  'never "User asks about…". Reply with the title alone.',
].join(" ");

/**
 * Asks the model for a title, or returns null.
 *
 * Null on every failure — an unavailable provider, a refusal, an empty answer.
 * A thread already has a usable placeholder, so replacing it with an error
 * string or a blank label would be strictly worse than leaving it alone.
 */
export async function generateThreadTitle(params: {
  userMessage: string;
  assistantMessage: string;
  log?: Logger;
}): Promise<string | null> {
  const log = params.log ?? rootLogger;

  if (!isModelAvailable(TITLE_MODEL_ID, configuredProviders)) return null;
  if (params.userMessage.trim().length === 0) return null;
  if (params.assistantMessage.trim().length === 0) return null;

  try {
    const response = await getDynamicModel(TITLE_MODEL_ID).invoke([
      { role: "system", content: TITLE_PROMPT },
      {
        role: "user",
        content: [
          `User: ${truncateForTitlePrompt(params.userMessage, 1000)}`,
          `Assistant: ${truncateForTitlePrompt(params.assistantMessage, 1000)}`,
        ].join("\n\n"),
      },
    ]);

    const text =
      typeof response.content === "string"
        ? response.content
        : response.content.map((block) => (block.type === "text" ? block.text : "")).join("");

    const title = normalizeGeneratedTitle(text);
    if (title === null) log.warn("thread.title_generation_empty");
    return title;
  } catch (error) {
    log.warn("thread.title_generation_failed", {}, error);
    return null;
  }
}

/**
 * Titles a thread from its opening exchange, if it still wants a title.
 *
 * Re-reads the thread before writing so a rename the user made while the first
 * answer streamed is not silently overwritten seconds later. Never throws —
 * it runs detached from the request, and a failed title is not worth an
 * unhandled rejection in the log.
 */
export async function maybeTitleThread(params: {
  threadId: string;
  userId: string;
  userMessage: string;
  assistantMessage: string;
  log?: Logger;
}): Promise<void> {
  const log = params.log ?? rootLogger;

  try {
    const thread = await findThreadForUser({ threadId: params.threadId, userId: params.userId });
    if (thread === null) return;
    if (!isPlaceholderTitle(thread.title, params.userMessage)) return;

    const title = await generateThreadTitle({
      userMessage: params.userMessage,
      assistantMessage: params.assistantMessage,
      ...(params.log === undefined ? {} : { log: params.log }),
    });
    if (title === null || title === thread.title) return;

    const current = await findThreadForUser({ threadId: params.threadId, userId: params.userId });
    if (current === null || !isPlaceholderTitle(current.title, params.userMessage)) return;

    await updateThread({ threadId: params.threadId, userId: params.userId, patch: { title } });
    log.info("thread.titled", { threadId: params.threadId });
  } catch (error) {
    log.warn("thread.title_update_failed", { threadId: params.threadId }, error);
  }
}
