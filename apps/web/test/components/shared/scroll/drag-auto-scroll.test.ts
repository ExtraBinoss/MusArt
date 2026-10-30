import { expect, it, vi } from "vitest";
import { createDragAutoScroll } from "../../../../src/components/shared/scroll/drag-auto-scroll";

function fixture() {
  const viewport = document.createElement("div");
  Object.defineProperties(viewport, {
    clientWidth: { value: 500 },
    clientHeight: { value: 200 },
    scrollWidth: { value: 1500 },
    scrollHeight: { value: 800, configurable: true },
  });
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: 500,
    bottom: 200,
  } as DOMRect);
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = ++sequence;
    frames.set(id, callback);
    return id;
  });
  const cancelFrame = vi.fn((id: number) => {
    frames.delete(id);
  });
  const onScroll = vi.fn();
  function tick(time: number) {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(time);
  }
  return { viewport, frames, requestFrame, cancelFrame, onScroll, tick };
}

it("uses one bounded frame loop for both axes and stops on release or leaving the edge", () => {
  const d = fixture(),
    scroll = createDragAutoScroll(d);
  scroll.update(495, 195);
  scroll.update(496, 196);
  expect(d.frames.size).toBe(1);
  d.tick(0);
  expect(d.viewport.scrollLeft).toBeGreaterThan(0);
  expect(d.viewport.scrollTop).toBeGreaterThan(0);
  const before = d.viewport.scrollLeft;
  d.tick(10_000);
  expect(d.viewport.scrollLeft - before).toBeLessThanOrEqual(23.04);
  expect(d.onScroll).toHaveBeenCalledTimes(2);
  scroll.update(350, 100);
  expect(d.frames.size).toBe(0);
  scroll.update(495, 195);
  scroll.stop();
  expect(d.frames.size).toBe(0);
  scroll.update(495, 195);
  expect(d.frames.size).toBe(0);
});

it("stops at scroll bounds and keeps ordinary track drags horizontal", () => {
  const d = fixture(),
    scroll = createDragAutoScroll({ ...d, horizontalOnly: true });
  scroll.update(495, 195);
  d.tick(0);
  expect(d.viewport.scrollTop).toBe(0);
  d.viewport.scrollLeft = 1000;
  d.tick(16);
  expect(d.frames.size).toBe(0);
  scroll.update(10, 195);
  expect(d.frames.size).toBe(0);
  scroll.stop();
});

it("coalesces interior pointer paint into one frame, keeps vertical drags vertical and stops idle", () => {
  const d = fixture(),
    onFrame = vi.fn();
  const scroll = createDragAutoScroll({ ...d, verticalOnly: true, onFrame });
  for (let index = 0; index < 50; index++) scroll.update(350 + index / 10, 100);
  expect(d.frames.size).toBe(1);
  d.tick(0);
  expect(onFrame).toHaveBeenCalledOnce();
  expect(d.frames.size).toBe(0);
  scroll.update(495, 195);
  d.tick(16);
  expect(d.viewport.scrollTop).toBeGreaterThan(0);
  expect(d.viewport.scrollLeft).toBe(0);
  scroll.stop();
  d.tick(32);
  expect(d.frames.size).toBe(0);
});

it("caches viewport rectangles through pixel moves and invalidates from native container resize", () => {
  const callbacks: ResizeObserverCallback[] = [],
    disconnect = vi.fn();
  const Original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      callbacks.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect = disconnect;
  };
  try {
    const d = fixture(),
      onGeometryChange = vi.fn();
    const scroll = createDragAutoScroll({
      ...d,
      verticalOnly: true,
      onFrame: vi.fn(),
      onGeometryChange,
    });
    for (let index = 0; index < 20; index++) {
      scroll.update(350 + index, 100);
      d.tick(index * 16);
    }
    expect(d.viewport.getBoundingClientRect).toHaveBeenCalledOnce();
    callbacks[0]!([], {} as ResizeObserver);
    scroll.update(375, 100);
    d.tick(400);
    expect(onGeometryChange).toHaveBeenCalledOnce();
    expect(d.viewport.getBoundingClientRect).toHaveBeenCalledTimes(2);
    scroll.stop();
    expect(disconnect).toHaveBeenCalledOnce();
  } finally {
    globalThis.ResizeObserver = Original;
  }
});

it("restarts a parked edge after content grows, but never resurrects a stopped gesture", () => {
  const callbacks: ResizeObserverCallback[] = [],
    Original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) {
      callbacks.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  try {
    const d = fixture();
    d.viewport.scrollTop = 600;
    const scroll = createDragAutoScroll({ ...d, verticalOnly: true });
    scroll.update(350, 195);
    expect(d.frames.size).toBe(0);
    Object.defineProperty(d.viewport, "scrollHeight", { value: 1000, configurable: true });
    callbacks[0]!([], {} as ResizeObserver);
    expect(d.frames.size).toBe(1);
    d.tick(0);
    expect(d.viewport.scrollTop).toBeGreaterThan(600);
    scroll.stop();
    callbacks[0]!([], {} as ResizeObserver);
    expect(d.frames.size).toBe(0);
  } finally {
    globalThis.ResizeObserver = Original;
  }
});
