import { afterEach, expect, test, vi } from "vitest";
import { installHorizontalScroll } from "../../../../src/components/shared/scroll/horizontal-scroll";

const disposers: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.unstubAllGlobals();
});
function fixture() {
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const root = document.createElement("div");
  root.innerHTML =
    '<div data-viewport tabindex="0"><div><button>Category</button><input></div></div><button data-horizontal-direction="-1"></button><button data-horizontal-direction="1"></button>';
  const viewport = root.querySelector<HTMLElement>("[data-viewport]")!;
  Object.defineProperties(viewport, {
    clientWidth: { value: 100, configurable: true },
    scrollWidth: { value: 800, configurable: true },
  });
  let captured: number | undefined;
  const capture = vi.fn((id: number) => {
      captured = id;
    }),
    release = vi.fn(() => {
      captured = undefined;
    });
  viewport.setPointerCapture = capture;
  viewport.hasPointerCapture = (id) => id === captured;
  viewport.releasePointerCapture = release;
  const frames = new Map<number, FrameRequestCallback>(),
    changes: EventListener[] = [],
    disconnect = vi.fn();
  let id = 0,
    resize!: ResizeObserverCallback;
  const reduced = {
    matches: false,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_: string, fn: EventListener) => changes.push(fn)),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  };
  vi.mocked(window.matchMedia).mockImplementation(() => reduced);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((handle: number) => frames.delete(handle)),
  );
  function frame(time: number) {
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(time);
  }
  function pointer(target: EventTarget, name: string, extra: Partial<PointerEvent> = {}) {
    const event = new MouseEvent(name, {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: extra.clientX ?? 0,
    });
    Object.defineProperties(event, {
      pointerType: { value: "mouse" },
      pointerId: { value: 1 },
      ...Object.fromEntries(Object.entries(extra).map(([key, value]) => [key, { value }])),
    });
    target.dispatchEvent(event);
    return event;
  }
  const stop = installHorizontalScroll(root, viewport);
  disposers.push(stop);
  return {
    root,
    viewport,
    stop,
    frames,
    frame,
    pointer,
    reduced,
    changes,
    disconnect,
    capture,
    release,
    resize: () => resize([], {} as ResizeObserver),
    left: root.querySelector<HTMLButtonElement>('[data-horizontal-direction="-1"]')!,
    right: root.querySelector<HTMLButtonElement>('[data-horizontal-direction="1"]')!,
  };
}
test("mouse hover advances bounded frames, while touch/pen and reduced motion do not start work", () => {
  const f = fixture();
  expect(f.left.disabled).toBe(true);
  expect(f.right.disabled).toBe(false);
  for (const pointerType of ["touch", "pen"]) {
    f.pointer(f.right, "pointerenter", { pointerType });
    expect(f.frames.size).toBe(0);
  }
  f.pointer(f.right, "pointerenter");
  f.frame(100);
  f.frame(120);
  expect(f.viewport.scrollLeft).toBeCloseTo(10.08);
  expect(f.left.disabled).toBe(false);
  f.pointer(f.right, "pointerleave");
  expect(f.frames.size).toBe(0);
  f.viewport.scrollLeft = 698;
  f.pointer(f.right, "pointerenter");
  f.frame(200);
  expect(f.viewport.scrollLeft).toBe(700);
  expect(f.right.disabled).toBe(true);
  expect(f.frames.size).toBe(0);
  f.reduced.matches = true;
  f.pointer(f.left, "pointerenter");
  expect(f.frames.size).toBe(0);
  f.left.click();
  expect(f.viewport.scrollLeft).toBe(604);
  f.stop();
});
test("wheel supports horizontal packets, vertical mice and line/page units without consuming limits or zoom", () => {
  const f = fixture();
  const wheel = (options: WheelEventInit) => {
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...options });
    f.viewport.dispatchEvent(event);
    return event;
  };
  expect(wheel({ deltaY: 20 }).defaultPrevented).toBe(true);
  expect(f.viewport.scrollLeft).toBe(20);
  wheel({ deltaX: 7, deltaY: 30 });
  expect(f.viewport.scrollLeft).toBe(27);
  wheel({ deltaY: 2, deltaMode: 1 });
  expect(f.viewport.scrollLeft).toBe(59);
  wheel({ deltaY: 1, deltaMode: 2 });
  expect(f.viewport.scrollLeft).toBe(159);
  expect(wheel({ deltaY: 20, ctrlKey: true }).defaultPrevented).toBe(false);
  expect(wheel({ deltaY: 20, metaKey: true }).defaultPrevented).toBe(false);
  expect(f.viewport.scrollLeft).toBe(159);
  f.viewport.scrollLeft = 700;
  expect(wheel({ deltaY: 20 }).defaultPrevented).toBe(false);
  f.stop();
});
test("the focusable viewport handles navigation without stealing child controls or composing keys", () => {
  const f = fixture();
  const key = (target: HTMLElement, value: string, options: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", {
      key: value,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    target.dispatchEvent(event);
    return event;
  };
  key(f.viewport, "ArrowRight");
  expect(f.viewport.scrollLeft).toBe(48);
  key(f.viewport, "PageDown");
  expect(f.viewport.scrollLeft).toBe(148);
  key(f.viewport, "End");
  expect(f.viewport.scrollLeft).toBe(700);
  key(f.viewport, "ArrowLeft");
  expect(f.viewport.scrollLeft).toBe(652);
  key(f.viewport, "PageUp");
  expect(f.viewport.scrollLeft).toBe(552);
  key(f.viewport, "Home");
  expect(f.viewport.scrollLeft).toBe(0);
  for (const options of [{ isComposing: true }, { keyCode: 229 }, { ctrlKey: true }])
    expect(key(f.viewport, "ArrowRight", options).defaultPrevented).toBe(false);
  key(f.viewport.querySelector("button")!, "ArrowRight");
  expect(f.viewport.scrollLeft).toBe(0);
  f.stop();
});
test("mouse pan preserves clicks until threshold, suppresses the completed drag click and never captures touch", () => {
  const f = fixture(),
    button = f.viewport.querySelector("button")!,
    clicked = vi.fn();
  button.addEventListener("click", clicked);
  f.pointer(button, "pointerdown", { clientX: 80 });
  f.pointer(window, "pointermove", { clientX: 78 });
  f.pointer(window, "pointerup", { clientX: 78 });
  button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  expect(clicked).toHaveBeenCalledOnce();
  f.pointer(button, "pointerdown", { clientX: 80 });
  const move = f.pointer(window, "pointermove", { clientX: 40 });
  expect(move.defaultPrevented).toBe(true);
  expect(f.viewport.scrollLeft).toBe(40);
  expect(f.root).toHaveAttribute("data-panning");
  expect(f.capture).toHaveBeenCalledExactlyOnceWith(1);
  f.pointer(window, "pointerup", { clientX: 40 });
  expect(f.root).not.toHaveAttribute("data-panning");
  expect(f.release).toHaveBeenCalledOnce();
  const click = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 });
  button.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(clicked).toHaveBeenCalledOnce();
  f.pointer(button, "pointerdown", { pointerType: "touch", clientX: 80 });
  f.pointer(window, "pointermove", { pointerType: "touch", clientX: 10 });
  expect(f.viewport.scrollLeft).toBe(40);
  f.stop();
});
test("resize clamps changed content; cancellation and cleanup release frames, observers, capture and listeners", () => {
  const f = fixture();
  f.viewport.scrollLeft = 600;
  Object.defineProperty(f.viewport, "scrollWidth", { value: 300 });
  f.resize();
  expect(f.viewport.scrollLeft).toBe(200);
  expect(f.right.disabled).toBe(true);
  f.viewport.scrollLeft = 50;
  f.viewport.dispatchEvent(new Event("scroll"));
  for (const name of ["blur", "visibilitychange"]) {
    f.pointer(f.right, "pointerenter");
    expect(f.frames.size).toBe(1);
    (name === "blur" ? window : document).dispatchEvent(new Event(name));
    expect(f.frames.size).toBe(0);
  }
  f.pointer(f.viewport, "pointerdown", { clientX: 80 });
  f.pointer(window, "pointermove", { clientX: 40 });
  f.pointer(window, "pointercancel");
  expect(f.root).not.toHaveAttribute("data-panning");
  f.pointer(f.right, "pointerenter");
  const before = f.viewport.scrollLeft;
  f.stop();
  expect(f.frames.size).toBe(0);
  expect(f.disconnect).toHaveBeenCalled();
  expect(f.reduced.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  f.pointer(f.right, "pointerenter");
  f.right.click();
  f.frame(400);
  expect(f.viewport.scrollLeft).toBe(before);
});
test("capture loss and reduced-motion changes cancel work, while hidden and editable surfaces cannot start it", () => {
  const f = fixture();
  f.pointer(f.viewport, "pointerdown", { clientX: 80 });
  f.pointer(window, "pointermove", { clientX: 40 });
  f.pointer(f.viewport, "lostpointercapture");
  expect(f.root).not.toHaveAttribute("data-panning");
  const before = f.viewport.scrollLeft;
  f.pointer(window, "pointermove", { clientX: 10 });
  expect(f.viewport.scrollLeft).toBe(before);
  f.pointer(f.viewport.querySelector("input")!, "pointerdown", { clientX: 80 });
  f.pointer(window, "pointermove", { clientX: 10 });
  expect(f.viewport.scrollLeft).toBe(before);
  f.pointer(f.right, "pointerenter");
  expect(f.frames.size).toBe(1);
  f.reduced.matches = true;
  for (const change of f.changes) change(new Event("change"));
  expect(f.frames.size).toBe(0);
  f.reduced.matches = false;
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  try {
    f.pointer(f.right, "pointerenter");
    expect(f.frames.size).toBe(0);
  } finally {
    hidden.mockRestore();
  }
});
test("non-overflowing and incomplete surfaces allocate no animation work", () => {
  const f = fixture();
  Object.defineProperty(f.viewport, "scrollWidth", { value: 100 });
  f.resize();
  expect(f.left.disabled).toBe(true);
  expect(f.right.disabled).toBe(true);
  const wheel = new WheelEvent("wheel", { deltaY: 20, cancelable: true });
  f.viewport.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);
  f.pointer(f.viewport, "pointerdown", { clientX: 80 });
  f.pointer(window, "pointermove", { clientX: 10 });
  expect(f.root).not.toHaveAttribute("data-panning");
  expect(f.frames.size).toBe(0);
  f.stop();
  f.left.remove();
  expect(() => installHorizontalScroll(f.root, f.viewport)()).not.toThrow();
});
