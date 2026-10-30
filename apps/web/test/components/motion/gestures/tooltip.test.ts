import { afterEach, expect, it, vi } from "vitest";
import { createKeyframeTooltipPreview } from "../../../../src/components/motion/gestures/tooltip";

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});
it("updates exact visible/accessibility tooltip times and restores both without leaving timers", () => {
  vi.useFakeTimers();
  const key = document.createElement("button"),
    value = document.createElement("span");
  key.dataset.keyId = "key";
  value.dataset.motionKeyTooltip = "key";
  value.dataset.timeUnit = "ms";
  value.textContent = "2000 ms";
  const accessible = value.cloneNode(true) as HTMLElement;
  document.body.append(key, value, accessible);
  const preview = createKeyframeTooltipPreview(key);
  preview.set({ value: 5, rate: 2 });
  expect(value).toHaveTextContent("2500 ms");
  expect(accessible).toHaveTextContent("2500 ms");
  expect(value).toHaveClass("is-live-number-changing");
  preview.dispose();
  preview.dispose();
  preview.set({ value: 9, rate: 1 });
  expect(value).toHaveTextContent("2000 ms");
  expect(accessible).toHaveTextContent("2000 ms");
  expect(value).not.toHaveClass("is-live-number-changing");
  expect(vi.getTimerCount()).toBe(0);
});
it("respects seconds and ignores absent or other-owner tooltip hosts", () => {
  const key = document.createElement("button"),
    value = document.createElement("span"),
    other = document.createElement("span");
  key.dataset.keyId = value.dataset.motionKeyTooltip = "key";
  value.dataset.timeUnit = "s";
  value.textContent = "0 s";
  other.dataset.motionKeyTooltip = "other";
  other.textContent = "unchanged";
  document.body.append(key, value, other);
  const preview = createKeyframeTooltipPreview(key);
  preview.set({ value: 1, rate: 3 });
  expect(value).toHaveTextContent("0.333333 s");
  expect(other).toHaveTextContent("unchanged");
  preview.dispose();
  key.dataset.keyId = "absent";
  const empty = createKeyframeTooltipPreview(key);
  empty.set({ value: 3, rate: 1 });
  empty.dispose();
});
