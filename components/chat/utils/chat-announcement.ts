import type { AppUIMessage } from "@/lib/chat/ui-message";
import type { ChatVisibleStatus } from "@/components/chat/types";

/**
 * What a screen reader should be told about the current turn.
 *
 * ## The problem this replaces
 *
 * The message list carried `aria-live="polite"` with
 * `aria-relevant="additions text"` directly on the scroll container. That is
 * the intuitive thing to do and it is close to unusable: a streaming answer
 * mutates its text node dozens of times a second, and a polite region re-reads
 * the changed content every time. In practice a screen reader either queues
 * hundreds of utterances or restarts the sentence continuously. The user
 * cannot listen to the answer and cannot leave the page in peace either.
 *
 * ## What replaces it
 *
 * The transcript stays a `role="log"` — that is a structural fact about it and
 * it is how a user navigates the conversation — but its live announcements are
 * turned off. Instead this function produces **one short utterance per state
 * transition**: generation started, a tool is running, the answer is finished
 * and how long it is, or what went wrong. The answer's text is then read by
 * navigating to it, at the user's pace, which is how reading works.
 *
 * ## `key`
 *
 * The caller announces only when `key` changes. Without it, any re-render
 * during streaming would re-write identical text into the live region, and a
 * region whose content is rewritten is a region that speaks again — the exact
 * failure this function exists to avoid.
 */
export type ChatAnnouncement = { key: string; message: string };

export function chatAnnouncement(params: {
  status: ChatVisibleStatus;
  messages: readonly AppUIMessage[];
}): ChatAnnouncement | null {
  const { status, messages } = params;

  switch (status.kind) {
    case "submitted":
      return { key: "submitted", message: "Generating a response." };

    case "tool-running":
      // Keyed by tool, so a turn that calls two tools announces both and a
      // turn that calls one announces it once.
      return { key: `tool:${status.toolName}`, message: status.label };

    case "streaming":
      // Silent on purpose. "Generating a response" has already been said and
      // the tokens themselves are not worth announcing; the completion below
      // is the next thing the user needs.
      return null;

    case "uploading":
      return { key: "uploading", message: status.label };

    case "stopped":
      return { key: "stopped", message: "Generation stopped." };

    case "error":
    case "rate-limited":
    case "quota-exceeded":
      // Keyed on the label so a second, different failure is announced and an
      // unchanged one is not repeated on every render.
      return { key: `error:${status.label}`, message: status.label };

    case "idle":
      return completionAnnouncement(messages);
  }
}

/**
 * The "answer is finished" utterance, keyed by message id.
 *
 * Reports length rather than content. A word count is what tells someone
 * whether to settle in or skim, and it is two syllables instead of four
 * hundred.
 */
function completionAnnouncement(messages: readonly AppUIMessage[]): ChatAnnouncement | null {
  const last = messages.at(-1);
  if (last === undefined || last.role !== "assistant") return null;

  const words = countWords(assistantText(last));
  if (words === 0) {
    // An assistant turn that produced only tool output and no prose. Saying
    // "0 words" would be technically true and useless.
    return { key: `done:${last.id}`, message: "Response complete." };
  }

  return {
    key: `done:${last.id}`,
    message: `Response complete. ${words} ${words === 1 ? "word" : "words"}.`,
  };
}

/**
 * The prose of an assistant turn.
 *
 * Deliberately not `messagePartsToPlainText`: that function reads the
 * *persisted* part union from `lib/ai/message-parts`, and what arrives here is
 * the AI SDK's live `UIMessagePart`, which carries variants the persisted
 * union does not have. Narrowing on `type === "text"` is the whole of the
 * overlap between them and is all a word count needs.
 */
function assistantText(message: AppUIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ");
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}
