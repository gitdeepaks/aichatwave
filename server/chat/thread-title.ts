export const THREAD_TITLE_MAX_LENGTH = 30;
export const FALLBACK_THREAD_TITLE = "New Chat";

/** Derives a thread title from the first user message. Pure and side-effect free. */
export function deriveThreadTitle(messageContent: string): string {
  const normalized = messageContent.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) return FALLBACK_THREAD_TITLE;
  if (normalized.length <= THREAD_TITLE_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, THREAD_TITLE_MAX_LENGTH).trimEnd()}…`;
}
