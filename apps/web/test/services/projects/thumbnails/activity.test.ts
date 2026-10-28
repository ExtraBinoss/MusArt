import { afterEach, expect, it, vi } from "vitest";
import { ThumbnailActivity } from "../../../../src/services/projects/thumbnails/activity";
afterEach(() => vi.useRealTimers());
it("suspends optional GPU work throughout a drag and trackpad input, then emits one quiet transition", () => {
  vi.useFakeTimers();
  const activity = new ThumbnailActivity(100),
    listener = vi.fn(),
    stop = activity.subscribe(listener);
  expect(activity.busy()).toBe(false);
  window.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 7 }));
  vi.advanceTimersByTime(200);
  expect(activity.busy()).toBe(true);
  window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7 }));
  expect(activity.busy()).toBe(true);
  vi.advanceTimersByTime(99);
  expect(activity.busy()).toBe(true);
  vi.advanceTimersByTime(1);
  expect(activity.busy()).toBe(false);
  window.dispatchEvent(new WheelEvent("wheel"));
  vi.advanceTimersByTime(50);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  vi.advanceTimersByTime(100);
  expect(activity.busy()).toBe(false);
  expect(listener).toHaveBeenCalled();
  stop();
  const before = listener.mock.calls.length;
  window.dispatchEvent(new Event("blur"));
  vi.advanceTimersByTime(100);
  expect(listener).toHaveBeenCalledTimes(before);
  activity.dispose();
});
it("handles cancellation and lost capture and removes timers and global input listeners", () => {
  vi.useFakeTimers();
  const activity = new ThumbnailActivity(10);
  window.dispatchEvent(new PointerEvent("pointerdown"));
  window.dispatchEvent(new PointerEvent("pointercancel"));
  vi.advanceTimersByTime(10);
  expect(activity.busy()).toBe(false);
  window.dispatchEvent(new PointerEvent("pointerdown"));
  window.dispatchEvent(new Event("blur"));
  vi.advanceTimersByTime(10);
  expect(activity.busy()).toBe(false);
  window.dispatchEvent(new PointerEvent("lostpointercapture"));
  activity.dispose();
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(100);
  window.dispatchEvent(new PointerEvent("pointerdown"));
  expect(activity.busy()).toBe(false);
});
it("tracks multiple real pointer identifiers independently", () => {
  vi.useFakeTimers();
  const activity = new ThumbnailActivity(10);
  function pointer(type: string, id: number) {
    const event = new Event(type);
    Object.defineProperty(event, "pointerId", { value: id });
    window.dispatchEvent(event);
  }
  pointer("pointerdown", 1);
  pointer("pointerdown", 2);
  pointer("pointerup", 1);
  vi.advanceTimersByTime(20);
  expect(activity.busy()).toBe(true);
  pointer("pointercancel", 2);
  vi.advanceTimersByTime(10);
  expect(activity.busy()).toBe(false);
  activity.dispose();
});
it("accepts synthetic cancellation events that do not carry a pointer identifier", () => {
  vi.useFakeTimers();
  const activity = new ThumbnailActivity(10);
  window.dispatchEvent(new Event("pointerdown"));
  expect(activity.busy()).toBe(true);
  window.dispatchEvent(new Event("pointerup"));
  vi.advanceTimersByTime(10);
  expect(activity.busy()).toBe(false);
  activity.dispose();
});
it("distinguishes held gestures from the background quiet period", () => {
  vi.useFakeTimers();
  const activity = new ThumbnailActivity(600),
    listener = vi.fn();
  activity.subscribe(listener);
  window.dispatchEvent(new PointerEvent("pointerdown"));
  expect(activity.interacting()).toBe(true);
  window.dispatchEvent(new PointerEvent("pointerup"));
  expect(activity.interacting()).toBe(false);
  expect(activity.busy()).toBe(true);
  window.dispatchEvent(new WheelEvent("wheel"));
  expect(activity.interacting()).toBe(true);
  vi.advanceTimersByTime(99);
  expect(activity.interacting()).toBe(true);
  vi.advanceTimersByTime(1);
  expect(activity.interacting()).toBe(false);
  expect(activity.busy()).toBe(true);
  expect(listener).toHaveBeenCalled();
  activity.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
it("quiets background hover work without delaying explicit foreground previews after movement", () => {
  vi.useFakeTimers();
  const activity = new ThumbnailActivity(100);
  window.dispatchEvent(new PointerEvent("pointermove"));
  expect(activity.busy()).toBe(true);
  expect(activity.interacting()).toBe(false);
  vi.advanceTimersByTime(99);
  expect(activity.busy()).toBe(true);
  vi.advanceTimersByTime(1);
  expect(activity.busy()).toBe(false);
  activity.dispose();
  window.dispatchEvent(new PointerEvent("pointermove"));
  expect(activity.busy()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
it("does not start background or foreground GPU work while native input is queued", () => {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, "scheduling"),
    pending = vi.fn(() => true);
  Object.defineProperty(navigator, "scheduling", {
    configurable: true,
    value: { isInputPending: pending },
  });
  const activity = new ThumbnailActivity(10);
  try {
    expect(activity.busy()).toBe(true);
    expect(activity.interacting()).toBe(true);
    expect(pending).toHaveBeenCalledWith({ includeContinuous: true });
    pending.mockReturnValue(false);
    expect(activity.busy()).toBe(false);
    expect(activity.interacting()).toBe(false);
  } finally {
    activity.dispose();
    if (descriptor) Object.defineProperty(navigator, "scheduling", descriptor);
    else Reflect.deleteProperty(navigator, "scheduling");
  }
});
