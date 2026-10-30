import { afterEach, expect, it, vi } from "vitest";
import {
  createKeyframeTooltipPreview,
  createClipDurationTooltipPreview,
  renderTimelineGestureTooltip,
} from "../../../../src/components/motion/gestures/tooltip";

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

it("discovers cold-down portals asynchronously, publishes the latest exact duration and never rescans on move", async () => {
  const wrap = document.createElement("div"),
    handle = document.createElement("button");
  wrap.dataset.motionClipId = "clip";
  wrap.append(handle);
  document.body.append(wrap);
  const query = vi.spyOn(document, "querySelectorAll");
  const preview = createClipDurationTooltipPreview(handle);
  preview.set({ value: 12345, rate: 1000 });
  const ms = document.createElement("span"),
    seconds = document.createElement("span"),
    portal = document.createElement("div");
  ms.dataset.motionClipTooltip = seconds.dataset.motionClipTooltip = "clip";
  ms.dataset.timeUnit = "ms";
  seconds.dataset.timeUnit = "s";
  ms.textContent = "4000 ms";
  seconds.textContent = "4 s";
  portal.append(ms, seconds);
  document.body.append(portal);
  await Promise.resolve();
  expect(ms).toHaveTextContent("12345 ms");
  expect(seconds).toHaveTextContent("12.345 s");
  for (let value = 0; value < 20; value++) preview.set({ value, rate: 3 });
  expect(query).toHaveBeenCalledOnce();
  preview.dispose();
  preview.dispose();
  expect(ms).toHaveTextContent("4000 ms");
  expect(seconds).toHaveTextContent("4 s");
  query.mockRestore();
});

it("reports clip duration during both trims and movement while key tooltips retain absolute time", () => {
  const tooltip = { set: vi.fn() },
    feedback = document.createElement("output");
  const base = {
    anchor: { value: 1, rate: 1 },
    delta: { value: 1, rate: 2 },
    snapped: null,
    page: { motion: { duration: { value: 5, rate: 1 } } },
    tooltip,
    track: {
      id: "clip",
      layerId: "layer",
      start: { value: 1, rate: 1 },
      end: { value: 5, rate: 1 },
      properties: [],
    },
  };
  for (const [action, duration] of [
    ["trimStart", 3.5],
    ["trimEnd", 4.5],
    ["move", 4],
  ] as const) {
    renderTimelineGestureTooltip(feedback, { ...base, action });
    const time = tooltip.set.mock.calls.at(-1)![0];
    expect(time.value / time.rate).toBe(duration);
  }
  renderTimelineGestureTooltip(feedback, { ...base, track: undefined, action: "keys" });
  expect(tooltip.set).toHaveBeenLastCalledWith({ value: 3, rate: 2 });
  expect(feedback).toHaveTextContent("1.500 s");
});
