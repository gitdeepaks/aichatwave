"use client";

import type { ChatStatus } from "ai";
import { useLayoutEffect, useRef } from "react";
import { useConversationContext } from "@/components/ai-elements/conversation";

/** User must be at least this far from the bottom before we treat it as “left the tail”. */
const LEAVE_BOTTOM_PX = 56;
/** After programmatic scroll-to-bottom, ignore scroll-driven stopScroll (ms). */
const PROGRAMMATIC_QUIET_MS = 220;

function distanceFromBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

/**
 * Syncs with the conversation scroll container: only call stopScroll when the user is clearly scrolling
 * up (not during layout or programmatic jumps), and skip spurious checks right after we
 * snap to bottom on submit.
 */
export function ConversationAutoScroll({ status }: { status: ChatStatus }) {
  const { scrollRef, stopScroll, scrollToBottom } = useConversationContext();
  const quietUntilRef = useRef(0);
  const lastScrollTopRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    lastScrollTopRef.current = node.scrollTop;

    const onScroll = () => {
      const el = scrollRef.current;
      if (!el) return;
      const now = performance.now();
      const top = el.scrollTop;
      const prev = lastScrollTopRef.current;

      if (now < quietUntilRef.current) {
        lastScrollTopRef.current = top;
        return;
      }

      const movedUp = prev !== null && top < prev - 0.5;
      lastScrollTopRef.current = top;

      if (movedUp && distanceFromBottom(el) > LEAVE_BOTTOM_PX) {
        stopScroll();
      }
    };

    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, [scrollRef, stopScroll]);

  useLayoutEffect(() => {
    if (status !== "submitted") return;
    quietUntilRef.current = performance.now() + PROGRAMMATIC_QUIET_MS;
    void scrollToBottom({ animation: "instant" });
  }, [status, scrollToBottom]);

  return null;
}
