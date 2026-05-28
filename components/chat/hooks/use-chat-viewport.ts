"use client";

import { useEffect } from "react";

export function useChatViewport(): void {
  useEffect(() => {
    const root = document.documentElement;

    const updateViewport = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      root.style.setProperty("--chat-viewport-height", `${viewportHeight}px`);
      root.style.setProperty("--chat-safe-bottom", "env(safe-area-inset-bottom)");
    };

    updateViewport();
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);

    return () => {
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);
}
