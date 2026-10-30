import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTimelineCanvasActivity } from "../../../../src/components/motion/canvas/activity";

beforeEach(() => vi.useFakeTimers());
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const stop of cleanups.splice(0)) stop();
  delete document.documentElement.dataset.layerReorderActive;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function fixture(initialShared = false) {
  const timeline = document.createElement("div"),
    viewport = document.createElement("div"),
    zoom = document.createElement("button"),
    onChange = vi.fn();
  timeline.className = "motion-timeline";
  zoom.className = "motion-zoom";
  timeline.append(zoom, viewport);
  document.body.append(timeline);
  if (initialShared) document.documentElement.dataset.layerReorderActive = "true";
  const activity = createTimelineCanvasActivity({ viewport, onChange });
  cleanups.push(() => activity.dispose());
  const pointer = (type: string, id: number, target: EventTarget = viewport) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0 });
    Object.defineProperty(event, "pointerId", { value: id });
    target.dispatchEvent(event);
  };
  return { timeline, viewport, zoom, onChange, activity, pointer };
}
it("gates both wheel axes at a clamped edge and resumes only after a quiet input interval", () => {
  const d = fixture(),
    raf = vi.spyOn(window, "requestAnimationFrame");
  d.viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaY: -100 }));
  expect(d.viewport.scrollTop).toBe(0);
  expect(d.activity.read()).toBe(true);
  vi.advanceTimersByTime(170);
  d.viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true, deltaX: 100, ctrlKey: true }));
  vi.advanceTimersByTime(170);
  expect(d.onChange).toHaveBeenCalledExactlyOnceWith(true);
  vi.advanceTimersByTime(10);
  expect(d.onChange).toHaveBeenLastCalledWith(false);
  expect(raf).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  d.activity.dispose();
});
it("holds pointer drags and zoom-slider input across axes until all captures finish or blur", () => {
  const d = fixture();
  d.pointer("pointerdown", 1, d.zoom);
  vi.advanceTimersByTime(1000);
  expect(d.activity.read()).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  d.pointer("pointerdown", 2);
  d.pointer("pointerup", 1, window);
  vi.advanceTimersByTime(200);
  expect(d.activity.read()).toBe(true);
  d.pointer("pointercancel", 2, window);
  vi.advanceTimersByTime(180);
  expect(d.activity.read()).toBe(false);
  d.zoom.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
  expect(d.activity.read()).toBe(true);
  d.pointer("pointerdown", 3);
  window.dispatchEvent(new Event("blur"));
  vi.advanceTimersByTime(180);
  expect(d.activity.read()).toBe(false);
  d.activity.dispose();
});
it("observes real scrolling and removes timers and listeners on retirement", () => {
  const d = fixture();
  d.viewport.scrollLeft = 100;
  d.viewport.dispatchEvent(new Event("scroll"));
  expect(d.activity.read()).toBe(true);
  d.activity.dispose();
  expect(d.onChange).toHaveBeenLastCalledWith(false);
  expect(vi.getTimerCount()).toBe(0);
  const count = d.onChange.mock.calls.length;
  d.viewport.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
  d.pointer("pointerdown", 4);
  d.viewport.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("blur"));
  vi.advanceTimersByTime(200);
  expect(d.onChange).toHaveBeenCalledTimes(count);
});
it("holds a shared Layers-origin drag outside the timeline, including an initially active owner", async () => {
  const d = fixture(true);
  expect(d.activity.read()).toBe(true);
  vi.advanceTimersByTime(1000);
  expect(d.onChange).toHaveBeenCalledExactlyOnceWith(true);
  d.pointer("pointercancel", 7, window);
  window.dispatchEvent(new Event("drop"));
  vi.advanceTimersByTime(200);
  expect(d.activity.read()).toBe(true);
  delete document.documentElement.dataset.layerReorderActive;
  await Promise.resolve();
  vi.advanceTimersByTime(180);
  expect(d.activity.read()).toBe(false);
  document.documentElement.dataset.layerReorderActive = "true";
  await Promise.resolve();
  expect(d.activity.read()).toBe(true);
  d.activity.dispose();
  delete document.documentElement.dataset.layerReorderActive;
  await Promise.resolve();
  const count = d.onChange.mock.calls.length;
  vi.advanceTimersByTime(200);
  expect(d.onChange).toHaveBeenCalledTimes(count);
});
it("keeps HTML drag admission after pointer cancellation and unions native, pointer and shared holds", async () => {
  const d = fixture();
  d.pointer("pointerdown", 1);
  d.viewport.dispatchEvent(new Event("dragstart", { bubbles: true }));
  d.pointer("pointercancel", 1, window);
  vi.advanceTimersByTime(1000);
  expect(d.activity.read()).toBe(true);
  expect(d.onChange).toHaveBeenCalledExactlyOnceWith(true);
  d.viewport.dispatchEvent(new MouseEvent("dragleave", { bubbles: true, relatedTarget: d.zoom }));
  vi.advanceTimersByTime(200);
  expect(d.activity.read()).toBe(true);
  d.pointer("pointerdown", 2);
  d.viewport.dispatchEvent(
    new MouseEvent("dragleave", { bubbles: true, relatedTarget: document.body }),
  );
  vi.advanceTimersByTime(200);
  expect(d.activity.read()).toBe(true);
  d.pointer("pointerup", 2, window);
  vi.advanceTimersByTime(180);
  expect(d.activity.read()).toBe(false);
  d.viewport.dispatchEvent(new Event("dragover", { bubbles: true }));
  document.documentElement.dataset.layerReorderActive = "true";
  await Promise.resolve();
  window.dispatchEvent(new Event("dragend"));
  vi.advanceTimersByTime(200);
  expect(d.activity.read()).toBe(true);
  delete document.documentElement.dataset.layerReorderActive;
  await Promise.resolve();
  vi.advanceTimersByTime(180);
  expect(d.activity.read()).toBe(false);
  d.viewport.dispatchEvent(new Event("dragover", { bubbles: true }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  vi.advanceTimersByTime(180);
  expect(d.activity.read()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
