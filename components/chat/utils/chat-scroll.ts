export type ScrollAnchor = {
  scrollHeight: number;
  scrollTop: number;
};

export type ScrollElement = {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
};

export const CHAT_SCROLL_THRESHOLDS = {
  nearBottomPx: 96,
  leaveBottomPx: 140,
  programmaticScrollQuietMs: 180,
} as const;

export function getDistanceFromBottom(element: ScrollElement): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

export function isWithinBottomThreshold(element: ScrollElement, thresholdPx: number): boolean {
  return getDistanceFromBottom(element) <= thresholdPx;
}

export function getScrollAnchor(element: ScrollElement): ScrollAnchor {
  return {
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  };
}

export function restoreScrollAnchor(element: ScrollElement, anchor: ScrollAnchor): void {
  const heightDelta = element.scrollHeight - anchor.scrollHeight;
  element.scrollTop = anchor.scrollTop + heightDelta;
}
