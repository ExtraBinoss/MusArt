import { afterEach, expect, it, vi } from "vitest";
import { ThumbnailActivity } from "../../../../src/services/projects/thumbnails/activity";
afterEach(() => vi.useRealTimers());
it("releases a canceled native drag without clearing a newer drag or reviving disposed work", async () => {
  vi.useFakeTimers();
  const activity = new ThumbnailActivity(100),
    listener = vi.fn(),
    source = document.body.appendChild(document.createElement("div"));
  const cancel = (event: Event) => event.preventDefault();
  source.addEventListener("dragstart", cancel);
  activity.subscribe(listener);
  const canceled = () =>
    source.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
  try {
    canceled();
    expect(activity.visibleBusy()).toBe(true);
    await Promise.resolve();
    expect(activity.visibleBusy()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(activity.busy()).toBe(false);
    canceled();
    window.dispatchEvent(new Event("dragstart"));
    await Promise.resolve();
    expect(activity.visibleBusy()).toBe(true);
    window.dispatchEvent(new Event("dragend"));
    expect(activity.visibleBusy()).toBe(false);
    canceled();
    activity.dispose();
    const notifications = listener.mock.calls.length;
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(notifications);
    expect(activity.visibleBusy()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    activity.dispose();
    source.remove();
  }
});
it("keeps native drag work suspended after pointer cancellation until drop, dragend or blur", () => {
  vi.useFakeTimers();
  const activity = new ThumbnailActivity(100);
  for (const ending of ["drop", "dragend", "blur"]) {
    window.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 7 }));
    window.dispatchEvent(new Event("dragstart"));
    window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 7 }));
    vi.advanceTimersByTime(1000);
    expect(activity.busy()).toBe(true);
    expect(activity.interacting()).toBe(true);
    expect(activity.visibleBusy()).toBe(true);
    window.dispatchEvent(new Event(ending));
    expect(activity.visibleBusy()).toBe(false);
    expect(activity.interacting()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(activity.busy()).toBe(false);
  }
  activity.dispose();
  window.dispatchEvent(new Event("dragstart"));
  expect(activity.visibleBusy()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
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
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "a" }));
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
  expect(activity.visibleBusy()).toBe(true);
  window.dispatchEvent(new PointerEvent("pointerup"));
  expect(activity.interacting()).toBe(false);
  expect(activity.visibleBusy()).toBe(false);
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
    expect(activity.visibleBusy()).toBe(true);
    expect(pending).toHaveBeenCalledWith({ includeContinuous: true });
    pending.mockReturnValue(false);
    expect(activity.busy()).toBe(false);
    expect(activity.interacting()).toBe(false);
    expect(activity.visibleBusy()).toBe(false);
  } finally {
    activity.dispose();
    if (descriptor) Object.defineProperty(navigator, "scheduling", descriptor);
    else Reflect.deleteProperty(navigator, "scheduling");
  }
});
it("blocks every GPU priority in hidden documents and wakes subscribers on return without polling", () => {
  vi.useFakeTimers();
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const activity = new ThumbnailActivity();
  const listener = vi.fn();
  activity.subscribe(listener);
  expect(activity.busy()).toBe(false);
  hidden.mockReturnValue(true);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(activity.busy()).toBe(true);
  expect(activity.interacting()).toBe(true);
  expect(activity.visibleBusy()).toBe(true);
  expect(listener).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  hidden.mockReturnValue(false);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(activity.busy()).toBe(false);
  expect(activity.interacting()).toBe(false);
  expect(activity.visibleBusy()).toBe(false);
  expect(listener).toHaveBeenCalledTimes(2);
  activity.dispose();
  document.dispatchEvent(new Event("visibilitychange"));
  expect(listener).toHaveBeenCalledTimes(2);
});
it("waits 100 ms after the last layer-list wheel packet while canonical work retains its quiet period", () => {
  vi.useFakeTimers();
  const tree = document.createElement("div");
  tree.className = "layer-tree";
  const child = tree.appendChild(document.createElement("span"));
  document.body.appendChild(tree);
  const activity = new ThumbnailActivity();
  try {
    for (let index = 0; index < 12; index++) {
      child.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
      vi.advanceTimersByTime(16);
      expect(activity.visibleBusy()).toBe(true);
    }
    vi.advanceTimersByTime(83);
    expect(activity.visibleBusy()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(activity.visibleBusy()).toBe(false);
    expect(activity.busy()).toBe(true);
    expect(activity.interacting()).toBe(false);
    expect(activity.busy()).toBe(true);
    vi.advanceTimersByTime(500);
    expect(activity.busy()).toBe(false);
  } finally {
    activity.dispose();
    tree.remove();
  }
});
it("a layer-list wheel never shortens a previous canvas deadline and blur/disposal release both timers", () => {
  vi.useFakeTimers();
  const tree = document.createElement("div");
  tree.className = "layer-tree";
  document.body.appendChild(tree);
  const activity = new ThumbnailActivity();
  try {
    window.dispatchEvent(new WheelEvent("wheel"));
    vi.advanceTimersByTime(40);
    tree.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    vi.advanceTimersByTime(59);
    expect(activity.visibleBusy()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(activity.visibleBusy()).toBe(true);
    expect(activity.interacting()).toBe(true);
    vi.advanceTimersByTime(40);
    expect(activity.visibleBusy()).toBe(false);
    tree.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    expect(vi.getTimerCount()).toBe(2);
    window.dispatchEvent(new Event("blur"));
    expect(activity.visibleBusy()).toBe(false);
    expect(activity.interacting()).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
  } finally {
    activity.dispose();
    tree.remove();
  }
  expect(vi.getTimerCount()).toBe(0);
});
it("held and repeating keyboard gestures suspend visible previews until release without blocking explicit export modifiers", () => {
  vi.useFakeTimers();
  const activity = new ThumbnailActivity();
  const listener = vi.fn();
  activity.subscribe(listener);
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight" }));
  expect(activity.visibleBusy()).toBe(true);
  expect(activity.interacting()).toBe(false);
  vi.advanceTimersByTime(1000);
  expect(activity.busy()).toBe(true);
  expect(activity.visibleBusy()).toBe(true);
  for (let index = 0; index < 12; index++) {
    vi.advanceTimersByTime(30);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "ArrowRight", key: "ArrowRight", repeat: true }),
    );
    expect(activity.visibleBusy()).toBe(true);
  }
  window.dispatchEvent(new KeyboardEvent("keyup", { code: "ArrowRight", key: "ArrowRight" }));
  expect(activity.visibleBusy()).toBe(false);
  expect(activity.busy()).toBe(true);
  expect(listener).toHaveBeenCalled();
  activity.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
it("tracks distinct keyboard keys, supports key-only and blank synthetic identities, and releases stuck keys on blur", () => {
  vi.useFakeTimers();
  const activity = new ThumbnailActivity();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "b" }));
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "a" }));
  expect(activity.visibleBusy()).toBe(true);
  window.dispatchEvent(new Event("blur"));
  expect(activity.visibleBusy()).toBe(false);
  window.dispatchEvent(new KeyboardEvent("keydown"));
  expect(activity.visibleBusy()).toBe(true);
  window.dispatchEvent(new KeyboardEvent("keyup"));
  expect(activity.visibleBusy()).toBe(false);
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "held-at-disposal" }));
  expect(activity.visibleBusy()).toBe(true);
  activity.dispose();
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "z" }));
  expect(activity.visibleBusy()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
