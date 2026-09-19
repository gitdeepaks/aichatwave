"use client";

import { useEffect, useRef, useState } from "react";

import type { AppUIMessage } from "@/lib/chat/ui-message";
import type { ChatVisibleStatus } from "@/components/chat/types";
import { chatAnnouncement } from "@/components/chat/utils/chat-announcement";

/**
 * The conversation's live region.
 *
 * One `aria-live="polite"` node holding one short sentence, updated only when
 * `chatAnnouncement` produces a new key. Everything about *what* to say lives
 * in that pure function; this component is the part that has to touch the DOM.
 *
 * `aria-atomic` so the sentence is read whole rather than as the diff against
 * the previous one — otherwise "Response complete. 412 words." following
 * "Response complete. 97 words." can be announced as just "412".
 *
 * Rendered visually hidden rather than `display: none`: a hidden element is
 * removed from the accessibility tree entirely and announces nothing. This is
 * the `sr-only` pattern, spelled out here because getting it wrong is silent.
 */
export function ChatAnnouncer({
  status,
  messages,
}: {
  status: ChatVisibleStatus;
  messages: readonly AppUIMessage[];
}) {
  const [announcement, setAnnouncement] = useState("");
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const next = chatAnnouncement({ status, messages });
    if (next === null || next.key === lastKeyRef.current) return;

    lastKeyRef.current = next.key;
    setAnnouncement(next.message);
  }, [status, messages]);

  return (
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {announcement}
    </p>
  );
}
