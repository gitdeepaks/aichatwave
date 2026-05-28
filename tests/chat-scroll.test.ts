import assert from "node:assert/strict";
import test from "node:test";
import {
  getDistanceFromBottom,
  getScrollAnchor,
  isWithinBottomThreshold,
  restoreScrollAnchor,
  type ScrollElement,
} from "@/components/chat/utils/chat-scroll";

class TestScrollElement implements ScrollElement {
  constructor(
    public scrollHeight: number,
    public scrollTop: number,
    public clientHeight: number,
  ) {}
}

test("calculates distance from bottom", () => {
  const element = new TestScrollElement(1_000, 650, 250);

  assert.equal(getDistanceFromBottom(element), 100);
});

test("detects whether an element is inside the bottom threshold", () => {
  const element = new TestScrollElement(1_000, 850, 100);

  assert.equal(isWithinBottomThreshold(element, 50), true);
  assert.equal(isWithinBottomThreshold(element, 49), false);
});

test("captures and restores scroll anchor after height changes", () => {
  const element = new TestScrollElement(1_000, 300, 400);
  const anchor = getScrollAnchor(element);

  element.scrollHeight = 1_250;
  restoreScrollAnchor(element, anchor);

  assert.equal(element.scrollTop, 550);
});
