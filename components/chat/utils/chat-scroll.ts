export type ScrollAnchor = {
  scrollHeight: number;
  scrollTop: number;
};

export function getDistanceFromBottom(element: HTMLElement): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight;
}

export function isWithinBottomThreshold(element: HTMLElement, thresholdPx: number): boolean {
  return getDistanceFromBottom(element) <= thresholdPx;
}

export function getScrollAnchor(element: HTMLElement): ScrollAnchor {
  return {
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  };
}

export function restoreScrollAnchor(element: HTMLElement, anchor: ScrollAnchor): void {
  const heightDelta = element.scrollHeight - anchor.scrollHeight;
  element.scrollTop = anchor.scrollTop + heightDelta;
}
