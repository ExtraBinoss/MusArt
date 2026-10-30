import { afterEach, expect, test, vi } from "vitest";
import { installCarouselPan } from "../../../../../src/components/projects/landing/carousel/controller";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0)) dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function fixture(
  options: {
    reducedMotion?: boolean;
    origin?: number;
    position?: number;
    autoScroll?: boolean;
    visible?: boolean;
  } = {},
) {
  vi.useFakeTimers();
  let resize!: ResizeObserverCallback,
    now = 0,
    nextFrame = 0;
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
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => frames.delete(id)),
  );
  vi.spyOn(performance, "now").mockImplementation(() => now);
  let intersection: IntersectionObserverCallback | undefined;
  let reduced = options.reducedMotion ?? false;
  const mediaListeners = new Map<string, Set<() => void>>();
  const intersectionDisconnect = vi.fn(),
    mediaRemove = vi.fn((_: string, listener: () => void) => {
      for (const listeners of mediaListeners.values()) listeners.delete(listener);
    });
  if (options.autoScroll) {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersection = callback;
        }
        observe() {}
        disconnect = intersectionDisconnect;
      },
    );
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          get matches() {
            return query.includes("prefers-reduced-motion")
              ? reduced
              : query.includes("pointer: fine");
          },
          media: query,
          addEventListener: (_: string, listener: () => void) => {
            const listeners = mediaListeners.get(query) ?? new Set();
            listeners.add(listener);
            mediaListeners.set(query, listeners);
          },
          removeEventListener: mediaRemove,
        }) as unknown as MediaQueryList,
    );
  }

  const node = document.createElement("div");
  node.style.columnGap = "24px";
  node.tabIndex = 0;
  node.setAttribute("data-carousel", "previous");
  const cards = Array.from({ length: 6 }, (_, index) => {
    const button = document.createElement("button");
    button.textContent = `Card ${index}`;
    node.append(button);
    return button;
  });
  cards[0]!.style.transform = "rotate(5deg)";
  cards[0]!.style.willChange = "opacity";
  let cardWidth = 350;
  const origin = options.origin ?? 24;
  const reads = vi.fn();
  Object.defineProperty(node, "clientWidth", {
    get: () => {
      reads();
      return 800;
    },
  });
  for (const [index, card] of cards.entries())
    Object.defineProperties(card, {
      offsetLeft: {
        get: () => {
          reads();
          return origin + index * (cardWidth + 24);
        },
      },
      offsetWidth: {
        get: () => {
          reads();
          return cardWidth;
        },
      },
    });
  const captured = new Set<number>();
  node.setPointerCapture = vi.fn((id) => {
    captured.add(id);
  });
  node.hasPointerCapture = vi.fn((id) => captured.has(id));
  node.releasePointerCapture = vi.fn((id) => {
    captured.delete(id);
    const event = new Event("lostpointercapture", { bubbles: true });
    Object.assign(event, { pointerId: id });
    node.dispatchEvent(event);
  });
  document.body.append(node);
  const events: boolean[] = [];
  node.addEventListener("musart:carousel-motion", (event) =>
    events.push((event as CustomEvent<{ moving: boolean }>).detail.moving),
  );
  const api = installCarouselPan(node, {
    reducedMotion: options.reducedMotion ?? false,
    position: options.position,
    autoScroll: options.autoScroll ?? false,
  });
  const measure = () => resize([], {} as ResizeObserver);
  measure();
  function intersect(visible: boolean) {
    intersection?.(
      [{ isIntersecting: visible } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  }
  if (options.autoScroll) intersect(options.visible ?? true);
  function pointer(type: string, x: number, time: number, y = 100, pointerType = "mouse") {
    now = time;
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 7, button: 0, pointerType, clientX: x, clientY: y });
    node.dispatchEvent(event);
    return event;
  }
  function frame(time: number) {
    now = time;
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(time);
  }
  function wheel(x: number, y = 0, extra: WheelEventInit = {}) {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaX: x,
      deltaY: y,
      ...extra,
    });
    node.dispatchEvent(event);
    return event;
  }
  function intervals() {
    return cards
      .map((card, index) => {
        const translate = Number(
          card.style.transform.match(/translate3d\(([-\d.eE]+)px/)?.[1] ?? 0,
        );
        return {
          left: origin + index * (cardWidth + 24) + translate,
          right: origin + index * (cardWidth + 24) + translate + cardWidth,
        };
      })
      .sort((a, b) => a.left - b.left);
  }
  function dispose() {
    api.dispose();
    node.remove();
  }
  cleanup.push(dispose);
  return {
    node,
    intersectionDisconnect,
    changeReduced: (value: boolean) => {
      reduced = value;
      for (const listener of mediaListeners.get("(prefers-reduced-motion: reduce)") ?? [])
        listener();
    },
    mediaRemove,
    intersect,
    time: () => now,
    elapse: (duration: number) => {
      now += duration;
      vi.advanceTimersByTime(duration);
    },
    cards,
    api,
    pointer,
    frame,
    frames,
    wheel,
    intervals,
    events,
    reads,
    measure,
    observe,
    disconnect,
    captured,
    dispose,
    period: () => 6 * (cardWidth + 24),
    resizeTo: (value: number) => {
      cardWidth = value;
      measure();
    },
  };
}

function expectCoverage(f: ReturnType<typeof fixture>) {
  const intervals = f.intervals();
  expect(intervals[0]!.left).toBeLessThanOrEqual(0);
  expect(intervals.at(-1)!.right).toBeGreaterThanOrEqual(800);
  for (let index = 1; index < intervals.length; index++)
    expect(intervals[index]!.left - intervals[index - 1]!.right).toBeCloseTo(24, 7);
}

test("loops many periods both ways with six retained nodes and no reads outside ResizeObserver", () => {
  const f = fixture({ origin: 80 });
  const nodes = [...f.node.children];
  const baselineReads = f.reads.mock.calls.length;
  for (const delta of [
    10 * f.period() + 360,
    -23 * f.period() - 777,
    374,
    375,
    -400,
    50 * f.period() + 453,
  ]) {
    const before = f.api.position();
    expect(f.wheel(delta).defaultPrevented).toBe(true);
    const expected = (((before + delta) % f.period()) + f.period()) % f.period();
    expect(f.api.position()).toBeCloseTo(expected, 7);
    expect(Number(f.node.dataset.carouselPosition)).toBeCloseTo(expected, 7);
    expectCoverage(f);
    expect([...f.node.children]).toEqual(nodes);
  }
  expect(f.reads).toHaveBeenCalledTimes(baselineReads);
  expect(f.events).toEqual([true]);
  vi.advanceTimersByTime(100);
  expect(f.events).toEqual([true, false]);
  expect(f.frames.size).toBe(0);
});

test("nonzero layout padding recycles only after a card has fully left the viewport", () => {
  const f = fixture({ origin: 80 });
  f.wheel(400);
  const first = f.intervals().find((interval) => Math.abs(interval.left + 320) < 0.01);
  expect(first).toEqual({ left: -320, right: 30 });
  expectCoverage(f);
  f.wheel(54);
  expectCoverage(f);
  f.wheel(1);
  expectCoverage(f);
});

test("released velocity continues moving then decays to rest without a React clock", () => {
  const f = fixture();
  f.pointer("pointerdown", 400, 0);
  expect(f.pointer("pointermove", 350, 16).defaultPrevented).toBe(true);
  f.pointer("pointermove", 250, 48);
  f.pointer("pointerup", 250, 64);
  const released = f.api.position();
  expect(f.captured.size).toBe(0);
  expect(f.frames.size).toBe(1);
  expect(f.node).toHaveAttribute("data-carousel-moving");
  f.frame(80);
  expect(f.api.position()).toBeGreaterThan(released);
  for (let time = 96; time <= 1800 && f.frames.size; time += 16) {
    f.frame(time);
    expectCoverage(f);
  }
  expect(f.frames.size).toBe(0);
  expect(f.node).not.toHaveAttribute("data-carousel-moving");
  expect(f.events).toEqual([true, false]);
});

test("holding still removes stale velocity and reduced motion omits release inertia", () => {
  const f = fixture();
  f.pointer("pointerdown", 400, 0);
  f.pointer("pointermove", 200, 16);
  f.pointer("pointerup", 200, 200);
  expect(f.frames.size).toBe(0);
  expect(f.node).not.toHaveAttribute("data-carousel-moving");
  f.dispose();
  const reduced = fixture({ reducedMotion: true });
  reduced.pointer("pointerdown", 400, 0);
  reduced.pointer("pointermove", 200, 16);
  reduced.pointer("pointerup", 200, 20);
  expect(reduced.api.position()).toBe(200);
  expect(reduced.frames.size).toBe(0);
  expect(reduced.node).not.toHaveAttribute("data-carousel-moving");
});

test("vertical touch/page wheel and zoom modifiers remain native while horizontal/shift wheel pan directly", () => {
  const f = fixture();
  f.pointer("pointerdown", 200, 0, 100, "touch");
  expect(f.pointer("pointermove", 203, 16, 145, "touch").defaultPrevented).toBe(false);
  f.pointer("pointerup", 203, 30, 145, "touch");
  expect(f.api.position()).toBe(0);
  expect(f.node.setPointerCapture).not.toHaveBeenCalled();
  expect(f.wheel(0, 200).defaultPrevented).toBe(false);
  expect(f.wheel(20, 200).defaultPrevented).toBe(false);
  expect(f.wheel(100, 0, { ctrlKey: true }).defaultPrevented).toBe(false);
  expect(f.wheel(100, 0, { metaKey: true }).defaultPrevented).toBe(false);
  expect(f.api.position()).toBe(0);
  expect(f.wheel(100, 20).defaultPrevented).toBe(true);
  expect(f.api.position()).toBe(100);
  expect(f.wheel(0, 5, { shiftKey: true, deltaMode: 1 }).defaultPrevented).toBe(true);
  expect(f.api.position()).toBe(180);
  expect(f.frames.size).toBe(0);
});

test("only a real drag suppresses a pointer click and keyboard activation stays available", () => {
  const f = fixture({ reducedMotion: true }),
    click = vi.fn();
  f.cards[0]!.addEventListener("click", click);
  f.pointer("pointerdown", 300, 0);
  f.pointer("pointermove", 200, 30);
  f.pointer("pointerup", 190, 50);
  expect(f.api.position()).toBe(110);
  const pointerClick = new MouseEvent("click", { detail: 1, bubbles: true, cancelable: true });
  f.cards[0]!.dispatchEvent(pointerClick);
  expect(pointerClick.defaultPrevented).toBe(true);
  expect(click).not.toHaveBeenCalled();
  f.cards[0]!.dispatchEvent(
    new MouseEvent("click", { detail: 0, bubbles: true, cancelable: true }),
  );
  expect(click).toHaveBeenCalledOnce();
  f.pointer("pointerdown", 200, 100);
  f.pointer("pointermove", 203, 110);
  f.pointer("pointerup", 203, 120);
  f.cards[0]!.dispatchEvent(
    new MouseEvent("click", { detail: 1, bubbles: true, cancelable: true }),
  );
  expect(click).toHaveBeenCalledTimes(2);
});

test("new input, pointer cancellation, blur and hidden documents stop ownership and pending frames", () => {
  const f = fixture();
  f.pointer("pointerdown", 400, 0);
  f.pointer("pointermove", 200, 16);
  f.pointer("pointerup", 200, 20);
  expect(f.frames.size).toBe(1);
  f.pointer("pointerdown", 200, 25);
  expect(f.frames.size).toBe(0);
  f.pointer("pointermove", 150, 40);
  f.pointer("pointercancel", 150, 41);
  expect(f.captured.size).toBe(0);
  expect(f.node).not.toHaveAttribute("data-carousel-moving");
  f.wheel(100);
  window.dispatchEvent(new Event("blur"));
  expect(f.node).not.toHaveAttribute("data-carousel-moving");
  f.pointer("pointerdown", 400, 100);
  f.pointer("pointermove", 200, 116);
  f.pointer("pointerup", 200, 120);
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(f.frames.size).toBe(0);
  expect(f.node).not.toHaveAttribute("data-carousel-moving");
});

test("viewport keyboard navigation and canonical button focus keep the intended slide visible", () => {
  const f = fixture();
  const right = new KeyboardEvent("keydown", {
    key: "ArrowRight",
    bubbles: true,
    cancelable: true,
  });
  f.node.dispatchEvent(right);
  expect(right.defaultPrevented).toBe(true);
  expect(f.api.position()).toBe(624);
  f.cards[0]!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  const left = Number(f.cards[0]!.style.transform.match(/translate3d\(([-\d.eE]+)px/)?.[1]) + 24;
  expect(left).toBeGreaterThanOrEqual(0);
  expect(left + 350).toBeLessThanOrEqual(800);
  const before = f.api.position();
  const childArrow = new KeyboardEvent("keydown", {
    key: "ArrowLeft",
    bubbles: true,
    cancelable: true,
  });
  f.cards[0]!.dispatchEvent(childArrow);
  expect(childArrow.defaultPrevented).toBe(false);
  expect(f.api.position()).toBe(before);
});

test("resize preserves the ring fraction and disposal restores styles/attributes and removes all work", () => {
  const f = fixture({ position: 500 });
  expect(f.api.position()).toBe(500);
  const fraction = f.api.position() / f.period();
  f.resizeTo(500);
  expect(f.api.position()).toBeCloseTo(fraction * f.period(), 7);
  expectCoverage(f);
  f.pointer("pointerdown", 400, 0);
  f.pointer("pointermove", 200, 16);
  f.pointer("pointerup", 200, 20);
  const remove = vi.spyOn(f.node, "removeEventListener");
  f.dispose();
  expect(f.frames.size).toBe(0);
  expect(f.disconnect).toHaveBeenCalledOnce();
  expect(f.node).toHaveAttribute("data-carousel", "previous");
  expect(f.node).not.toHaveAttribute("data-carousel-position");
  expect(f.cards[0]!.style.transform).toBe("rotate(5deg)");
  expect(f.cards[0]!.style.willChange).toBe("opacity");
  expect(remove).toHaveBeenCalledWith("pointermove", expect.any(Function));
  expect(remove).toHaveBeenCalledWith("wheel", expect.any(Function));
  const before = f.api.position();
  f.wheel(100);
  f.frame(100);
  expect(f.api.position()).toBe(before);
});

test("browser focus during pointerdown cannot settle an active held drag or jump the clicked card", () => {
  const f = fixture({ origin: 80, reducedMotion: true });
  f.pointer("pointerdown", 30, 0);
  f.cards[5]!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  expect(f.api.position()).toBe(0);
  f.pointer("pointermove", -70, 20);
  vi.advanceTimersByTime(150);
  expect(f.node).toHaveAttribute("data-dragging", "true");
  expect(f.node).toHaveAttribute("data-carousel-moving");
  expect(f.events).toEqual([true]);
  f.pointer("pointerup", -70, 180);
  expect(f.node).not.toHaveAttribute("data-carousel-moving");
  expect(f.events).toEqual([true, false]);
});

test("automatic drift advances with a gentle ramp, owns one frame and pauses for fine hover", () => {
  const f = fixture({ autoScroll: true });
  const baselineReads = f.reads.mock.calls.length;
  expect(f.node).toHaveAttribute("data-carousel-auto");
  expect(f.frames.size).toBe(1);
  f.frame(16);
  const first = f.api.position();
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(0.1);
  for (let time = 32; time <= 1000; time += 16) f.frame(time);
  expect(f.api.position()).toBeGreaterThan(12);
  expect(f.api.position()).toBeLessThan(25);
  expect(f.reads).toHaveBeenCalledTimes(baselineReads);
  f.node.dispatchEvent(new Event("pointerenter"));
  expect(f.node).not.toHaveAttribute("data-carousel-auto");
  expect(f.node).not.toHaveAttribute("data-carousel-moving");
  expect(f.frames.size).toBe(0);
  const stopped = f.api.position();
  f.elapse(5000);
  expect(f.api.position()).toBe(stopped);
  f.node.dispatchEvent(new Event("pointerleave"));
  f.elapse(1199);
  expect(f.frames.size).toBe(0);
  f.elapse(1);
  expect(f.frames.size).toBe(1);
  f.frame(f.time() + 16);
  expect(f.api.position() - stopped).toBeGreaterThan(0);
  expect(f.api.position() - stopped).toBeLessThan(0.1);
});

test("manual drag and release inertia finish before automatic drift resumes after quiet", () => {
  const f = fixture({ autoScroll: true });
  f.frame(16);
  f.pointer("pointerdown", 400, 20);
  expect(f.node).not.toHaveAttribute("data-carousel-auto");
  expect(f.frames.size).toBe(0);
  f.pointer("pointermove", 250, 40);
  f.pointer("pointerup", 250, 48);
  expect(f.frames.size).toBe(1);
  expect(f.node).toHaveAttribute("data-carousel-moving");
  expect(f.node).not.toHaveAttribute("data-carousel-auto");
  for (let time = 64; time <= 1800 && f.frames.size; time += 16) f.frame(time);
  expect(f.frames.size).toBe(0);
  expect(f.node).not.toHaveAttribute("data-carousel-moving");
  const released = f.api.position();
  f.elapse(1199);
  expect(f.frames.size).toBe(0);
  f.elapse(1);
  expect(f.node).toHaveAttribute("data-carousel-auto");
  f.frame(f.time() + 16);
  expect(f.api.position()).toBeGreaterThan(released);
});

test("keyboard focus-visible pauses auto while stale mouse focus permits gentle resume", () => {
  const f = fixture({ autoScroll: true });
  vi.spyOn(f.cards[0]!, "matches").mockReturnValue(true);
  f.cards[0]!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  expect(f.node).not.toHaveAttribute("data-carousel-auto");
  f.elapse(5000);
  expect(f.frames.size).toBe(0);
  f.node.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }));
  f.elapse(1200);
  expect(f.node).toHaveAttribute("data-carousel-auto");
  f.pointer("pointerdown", 200, f.time() + 10);
  f.cards[0]!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  f.pointer("pointerup", 200, f.time() + 10);
  f.elapse(1200);
  expect(f.node).toHaveAttribute("data-carousel-auto");
});

test("offscreen, hidden, blurred and reduced-motion carousels keep no automatic RAF", () => {
  const f = fixture({ autoScroll: true, visible: false });
  expect(f.frames.size).toBe(0);
  f.intersect(true);
  expect(f.node).toHaveAttribute("data-carousel-auto");
  f.intersect(false);
  expect(f.frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  f.intersect(true);
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(f.frames.size).toBe(0);
  f.elapse(5000);
  expect(f.frames.size).toBe(0);
  hidden.mockReturnValue(false);
  document.dispatchEvent(new Event("visibilitychange"));
  f.elapse(1200);
  expect(f.node).toHaveAttribute("data-carousel-auto");
  window.dispatchEvent(new Event("blur"));
  expect(f.frames.size).toBe(0);
  window.dispatchEvent(new Event("focus"));
  f.elapse(1200);
  expect(f.node).toHaveAttribute("data-carousel-auto");
  f.dispose();
  const reduced = fixture({ autoScroll: true, reducedMotion: true });
  reduced.elapse(5000);
  expect(reduced.frames.size).toBe(0);
  expect(reduced.node).not.toHaveAttribute("data-carousel-auto");
});

test("automatic ownership releases all observers, media listeners, timers and late intersection entries", () => {
  const f = fixture({ autoScroll: true });
  f.node.dispatchEvent(new Event("pointerenter"));
  f.node.dispatchEvent(new Event("pointerleave"));
  expect(vi.getTimerCount()).toBe(1);
  f.dispose();
  expect(f.frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(f.intersectionDisconnect).toHaveBeenCalledOnce();
  expect(f.mediaRemove).toHaveBeenCalledWith("change", expect.any(Function));
  f.intersect(true);
  f.elapse(5000);
  expect(f.frames.size).toBe(0);
  expect(f.node).toHaveAttribute("data-carousel", "previous");
  expect(f.node).not.toHaveAttribute("data-carousel-auto");
});

test("live reduced-motion changes stop automatic and inertial frames then resume when enabled", () => {
  const f = fixture({ autoScroll: true });
  expect(f.node).toHaveAttribute("data-carousel-auto");
  f.changeReduced(true);
  expect(f.frames.size).toBe(0);
  expect(f.node).not.toHaveAttribute("data-carousel-moving");
  f.elapse(5000);
  expect(f.frames.size).toBe(0);
  f.changeReduced(false);
  f.elapse(1200);
  expect(f.node).toHaveAttribute("data-carousel-auto");
  f.pointer("pointerdown", 400, f.time() + 1);
  f.pointer("pointermove", 200, f.time() + 16);
  f.pointer("pointerup", 200, f.time() + 16);
  expect(f.frames.size).toBe(1);
  f.changeReduced(true);
  expect(f.frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
