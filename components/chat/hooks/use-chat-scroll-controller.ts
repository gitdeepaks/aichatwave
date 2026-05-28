"use client";

import type { ChatStatus, UIMessage } from "ai";
import type { RefObject, UIEventHandler } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  getDistanceFromBottom,
  getScrollAnchor,
  isWithinBottomThreshold,
  restoreScrollAnchor,
  type ScrollAnchor,
} from "@/components/chat/utils/chat-scroll";

const NEAR_BOTTOM_PX = 96;
const LEAVE_BOTTOM_PX = 140;
const PROGRAMMATIC_SCROLL_QUIET_MS = 180;

export type ChatScrollController = {
  scrollRef: RefObject<HTMLDivElement | null>;
  isNearBottom: boolean;
  showScrollButton: boolean;
  onScroll: UIEventHandler<HTMLDivElement>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
};

export function useChatScrollController({
  messages,
  status,
}: {
  messages: UIMessage[];
  status: ChatStatus;
}): ChatScrollController {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const previousMessageCountRef = useRef(messages.length);
  const previousLastMessageIdRef = useRef(messages.at(-1)?.id);
  const wasNearBottomRef = useRef(true);
  const userHasLeftBottomRef = useRef(false);
  const programmaticScrollUntilRef = useRef(0);
  const previousAnchorRef = useRef<ScrollAnchor | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const updateBottomState = useCallback((element: HTMLElement) => {
    const nextIsNearBottom = isWithinBottomThreshold(element, NEAR_BOTTOM_PX);
    const distance = getDistanceFromBottom(element);

    setIsNearBottom(nextIsNearBottom);
    setShowScrollButton(!nextIsNearBottom);
    wasNearBottomRef.current = nextIsNearBottom;

    if (distance > LEAVE_BOTTOM_PX) {
      userHasLeftBottomRef.current = true;
    } else if (nextIsNearBottom) {
      userHasLeftBottomRef.current = false;
    }
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const element = scrollRef.current;
    if (!element) return;

    programmaticScrollUntilRef.current = performance.now() + PROGRAMMATIC_SCROLL_QUIET_MS;
    element.scrollTo({ top: element.scrollHeight, behavior });
    userHasLeftBottomRef.current = false;
    setIsNearBottom(true);
    setShowScrollButton(false);
    wasNearBottomRef.current = true;
  }, []);

  const onScroll: UIEventHandler<HTMLDivElement> = useCallback(
    (event) => {
      const element = event.currentTarget;
      const now = performance.now();
      const nextIsNearBottom = isWithinBottomThreshold(element, NEAR_BOTTOM_PX);
      const distance = getDistanceFromBottom(element);

      setIsNearBottom(nextIsNearBottom);
      setShowScrollButton(!nextIsNearBottom);
      wasNearBottomRef.current = nextIsNearBottom;

      if (now < programmaticScrollUntilRef.current) {
        return;
      }

      if (distance > LEAVE_BOTTOM_PX) {
        userHasLeftBottomRef.current = true;
      } else if (nextIsNearBottom) {
        userHasLeftBottomRef.current = false;
      }
    },
    [],
  );

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    previousAnchorRef.current = getScrollAnchor(element);
  });

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const previousMessageCount = previousMessageCountRef.current;
    const previousLastMessageId = previousLastMessageIdRef.current;
    const lastMessage = messages.at(-1);
    const messageCountChanged = messages.length !== previousMessageCount;
    const lastMessageChanged = lastMessage?.id !== previousLastMessageId;
    const isNewUserMessage = Boolean(lastMessageChanged && lastMessage?.role === "user");
    const isHydratingHistory = messageCountChanged && !isNewUserMessage && previousMessageCount === 0;

    if (isNewUserMessage) {
      scrollToBottom("auto");
    } else if (isHydratingHistory && previousAnchorRef.current) {
      restoreScrollAnchor(element, previousAnchorRef.current);
      updateBottomState(element);
    } else if (status === "streaming" && wasNearBottomRef.current && !userHasLeftBottomRef.current) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(() => {
        scrollToBottom("auto");
      });
    } else {
      updateBottomState(element);
    }

    previousMessageCountRef.current = messages.length;
    previousLastMessageIdRef.current = lastMessage?.id;
  }, [messages, status, scrollToBottom, updateBottomState]);

  useLayoutEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    },
    [],
  );

  return { scrollRef, isNearBottom, showScrollButton, onScroll, scrollToBottom };
}
