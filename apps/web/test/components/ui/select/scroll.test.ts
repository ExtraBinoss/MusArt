import { afterEach, expect, test, vi } from "vitest";
import { bindSelectScroll } from "../../../../src/components/ui/select/scroll";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
function setup() {
  const content = document.createElement("div"),
    viewport = document.createElement("div");
  content.dataset.state = "open";
  content.append(viewport);
  viewport.append(document.createElement("div"));
  document.body.append(content);
  const dimensions = { height: 100, scrollHeight: 500, width: 200, offsetWidth: 206 };
  const rect = vi.fn(
    () => ({ left: 10, right: 210, top: 20, bottom: 120, width: 200, height: 100 }) as DOMRect,
  );
  vi.spyOn(viewport, "getBoundingClientRect").mockImplementation(rect);
  Object.defineProperties(viewport, {
    clientHeight: { get: () => dimensions.height },
    scrollHeight: { get: () => dimensions.scrollHeight },
    clientWidth: { get: () => dimensions.width },
    offsetWidth: { get: () => dimensions.offsetWidth },
  });
  let hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0,
    time = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = ++sequence;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  let resize!: ResizeObserverCallback;
  const disconnect = vi.fn(),
    observe = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const remove = vi.spyOn(viewport, "removeEventListener");
  const cleanup = bindSelectScroll(viewport, content);
  function hover(x: number, y: number, type = "mouse", buttons = 0, name = "pointermove") {
    const event = new MouseEvent(name, { clientX: x, clientY: y, buttons, bubbles: true });
    Object.defineProperty(event, "pointerType", { value: type });
    viewport.dispatchEvent(event);
    return event;
  }
  return {
    viewport,
    content,
    dimensions,
    rect,
    frames,
    cleanup,
    remove,
    disconnect,
    observe,
    hover,
    resize: () => resize([], {} as ResizeObserver),
    hidden: (value: boolean) => {
      hidden = value;
      document.dispatchEvent(new Event("visibilitychange"));
    },
    advance(milliseconds = 16) {
      time += milliseconds;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(time);
    },
  };
}

test("runs one bounded frame only while a mouse hovers an overflowing edge", () => {
  const d = setup();
  expect(d.frames.size).toBe(0);
  d.hover(80, 65, "mouse", 0, "pointerenter");
  expect(d.frames.size).toBe(0);
  d.hover(80, 118);
  expect(d.content).toHaveAttribute("data-select-edge-scroll", "bottom");
  expect(d.frames.size).toBe(1);
  d.hover(85, 119);
  expect(d.frames.size).toBe(1);
  d.advance();
  expect(d.viewport.scrollTop).toBeCloseTo(5.76);
  expect(d.frames.size).toBe(1);
  expect(d.rect).toHaveBeenCalledTimes(1);
  d.hover(80, 65);
  expect(d.frames.size).toBe(0);
  expect(d.content).not.toHaveAttribute("data-select-edge-scroll");
  d.cleanup();
});

test("supports both boundaries and stops precisely at the content limit", () => {
  const d = setup();
  d.hover(80, 21);
  expect(d.frames.size).toBe(0);
  d.viewport.scrollTop = 395;
  d.hover(80, 118);
  d.advance();
  expect(d.viewport.scrollTop).toBe(400);
  expect(d.frames.size).toBe(0);
  d.hover(80, 21);
  expect(d.content).toHaveAttribute("data-select-edge-scroll", "top");
  d.advance();
  expect(d.viewport.scrollTop).toBeLessThan(400);
  d.viewport.scrollTop = 2;
  d.advance();
  expect(d.viewport.scrollTop).toBe(0);
  expect(d.frames.size).toBe(0);
  d.cleanup();
});

test("leaves scrollbar, touch, pressed pointer and ordinary item interaction native", () => {
  const d = setup();
  for (const x of [204, 209, 220]) d.hover(x, 118);
  expect(d.frames.size).toBe(0);
  for (const type of ["touch", "pen"]) d.hover(80, 118, type);
  d.hover(80, 118, "mouse", 1);
  expect(d.frames.size).toBe(0);
  const event = d.hover(80, 118);
  expect(event.defaultPrevented).toBe(false);
  const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
  d.viewport.dispatchEvent(down);
  expect(d.frames.size).toBe(0);
  expect(down.defaultPrevented).toBe(false);
  d.cleanup();
});

test("wheel, keyboard, blur, pointer exit, document hiding and closing stop scrolling", () => {
  const d = setup();
  for (const event of [
    new Event("wheel"),
    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    new Event("pointerleave"),
    new Event("pointercancel"),
  ]) {
    d.hover(80, 118);
    expect(d.frames.size).toBe(1);
    d.viewport.dispatchEvent(event);
    expect(d.frames.size).toBe(0);
  }
  d.hover(80, 118);
  window.dispatchEvent(new Event("blur"));
  expect(d.frames.size).toBe(0);
  d.hover(80, 118);
  d.hidden(true);
  expect(d.frames.size).toBe(0);
  d.hidden(false);
  d.hover(80, 118);
  d.content.dataset.state = "closed";
  d.advance();
  expect(d.frames.size).toBe(0);
  d.cleanup();
});

test("observes new option layout lazily and releases frames, listeners and observers", async () => {
  const d = setup();
  expect(d.rect).not.toHaveBeenCalled();
  d.resize();
  expect(d.rect).toHaveBeenCalledOnce();
  d.rect.mockClear();
  const option = document.createElement("div");
  d.viewport.append(option);
  await Promise.resolve();
  expect(d.observe).toHaveBeenCalledWith(option);
  expect(d.rect).not.toHaveBeenCalled();
  d.dimensions.scrollHeight = 100;
  d.resize();
  d.hover(80, 118);
  expect(d.frames.size).toBe(0);
  d.dimensions.scrollHeight = 500;
  d.resize();
  d.hover(80, 118);
  d.cleanup();
  expect(d.frames.size).toBe(0);
  expect(d.disconnect).toHaveBeenCalled();
  expect(d.remove).toHaveBeenCalledWith("pointermove", expect.any(Function));
  d.hover(80, 118);
  expect(d.frames.size).toBe(0);
});
