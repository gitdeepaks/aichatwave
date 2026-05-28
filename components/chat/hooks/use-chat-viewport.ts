"use client";

import type { RefObject } from "react";
import { useEffect } from "react";

export function useChatViewport(composerRef?: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = document.documentElement;

    const updateViewport = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      root.style.setProperty("--chat-viewport-height", `${viewportHeight}px`);
      root.style.setProperty("--chat-safe-bottom", "env(safe-area-inset-bottom)");
      const composerHeight = composerRef?.current?.getBoundingClientRect().height ?? 0;
      root.style.setProperty("--chat-composer-height", `${composerHeight}px`);
    };

    updateViewport();
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);

    const composer = composerRef?.current ?? null;
    const resizeObserver = composer ? new ResizeObserver(updateViewport) : null;
    if (composer) {
      resizeObserver?.observe(composer);
    }

    return () => {
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      resizeObserver?.disconnect();
    };
  }, [composerRef]);
}
