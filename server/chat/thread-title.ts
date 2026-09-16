/**
 * Thread title text handling. Pure, and deliberately kept that way.
 *
 * The model call that produces a *good* title lives in
 * `server/chat/title-generation.ts`, which reaches for provider credentials
 * and so cannot be imported without a configured environment. Everything here
 * is string work, which is what lets it be tested on its own.
 *
 * `deriveThreadTitle` runs on the write path and gives the sidebar something
 * the moment a thread exists; the generated title replaces it once the first
 * exchange is known. The placeholder is necessary because at creation time the
 * only material available is the user's opening message, and "Can you help me
 * with this" truncated at 30 characters is what the sidebar used to be full of.
 */

export const THREAD_TITLE_MAX_LENGTH = 30;
/** What a generated title may run to. Longer than the derived one; still one line. */
export const GENERATED_TITLE_MAX_LENGTH = 60;
export const FALLBACK_THREAD_TITLE = "New Chat";

/** Derives a thread title from the first user message. Pure and side-effect free. */
export function deriveThreadTitle(messageContent: string): string {
  const normalized = messageContent.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) return FALLBACK_THREAD_TITLE;
  if (normalized.length <= THREAD_TITLE_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, THREAD_TITLE_MAX_LENGTH).trimEnd()}…`;
}

/**
 * Strips what small models add anyway, and returns null when nothing usable
 * is left.
 *
 * Asking for no quotes and no "Title:" prefix removes most of it; a cheap
 * model still produces them often enough that trusting the instruction alone
 * would put `"Title: Deploying to Vercel"` in the sidebar.
 */
export function normalizeGeneratedTitle(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^\s*(?:title|subject)\s*[:\-–—]\s*/iu, "")
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/gu, "")
    .replace(/[.。!！?？]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length === 0) return null;
  if (cleaned.length <= GENERATED_TITLE_MAX_LENGTH) return cleaned;
  return `${cleaned.slice(0, GENERATED_TITLE_MAX_LENGTH).trimEnd()}…`;
}

/**
 * Whether a thread's current title is still the placeholder, and so may be
 * replaced by a generated one.
 *
 * Checked rather than assumed: a user who renamed a conversation while its
 * first answer was streaming must not have that rename overwritten seconds
 * later by a title the model wrote.
 */
export function isPlaceholderTitle(title: string, firstUserMessage: string): boolean {
  return title === FALLBACK_THREAD_TITLE || title === deriveThreadTitle(firstUserMessage);
}

/** Bounds what is sent to the title model; the first paragraphs decide the subject. */
export function truncateForTitlePrompt(value: string, limit: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}…`;
}
