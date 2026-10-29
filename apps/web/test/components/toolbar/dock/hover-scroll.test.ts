import { afterEach, expect, test, vi } from "vitest";
import { installHoverScroll } from "../../../../src/components/toolbar/dock/hover-scroll";

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const root = document.createElement("div");
  root.innerHTML =
    '<div><div data-viewport><button>Tool</button></div></div><button data-scroll-direction="-1"></button><button data-scroll-direction="1"></button>';
  const viewport = root.querySelector<HTMLElement>("[data-viewport]")!;
  Object.defineProperties(viewport, {
    clientHeight: { value: 100 },
    scrollHeight: { value: 800, configurable: true },
  });
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
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
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(time);
  }
  return {
    root,
    viewport,
    frames,
    frame,
    up: root.querySelector<HTMLButtonElement>('[data-scroll-direction="-1"]')!,
    down: root.querySelector<HTMLButtonElement>('[data-scroll-direction="1"]')!,
  };
}
test("hover scrolls without clicks, updates overflow and stops at boundaries or leave", () => {
  const f = fixture(),
    stop = installHoverScroll(f.root, f.viewport);
  expect(f.up.disabled).toBe(true);
  expect(f.down.disabled).toBe(false);
  expect(f.root.hasAttribute("data-scroll-down")).toBe(true);
  f.down.dispatchEvent(new Event("pointerenter"));
  f.frame(100);
  f.frame(120);
  expect(f.viewport.scrollTop).toBeCloseTo(10.08);
  expect(f.up.disabled).toBe(false);
  f.down.dispatchEvent(new Event("pointerleave"));
  expect(f.frames.size).toBe(0);
  f.viewport.scrollTop = 698;
  f.down.dispatchEvent(new Event("pointerenter"));
  f.frame(200);
  expect(f.viewport.scrollTop).toBe(700);
  expect(f.down.disabled).toBe(true);
  expect(f.frames.size).toBe(0);
  f.up.dispatchEvent(new Event("pointerenter"));
  f.frame(300);
  expect(f.viewport.scrollTop).toBeLessThan(700);
  stop();
  expect(f.frames.size).toBe(0);
});
test("supports keyboard clicks and cancels frames/listeners on visibility, blur and cleanup", () => {
  const f = fixture(),
    stop = installHoverScroll(f.root, f.viewport);
  f.down.click();
  expect(f.viewport.scrollTop).toBe(96);
  f.up.click();
  expect(f.viewport.scrollTop).toBe(0);
  f.down.dispatchEvent(new Event("pointerdown"));
  document.dispatchEvent(new Event("visibilitychange"));
  expect(f.frames.size).toBe(0);
  f.down.dispatchEvent(new Event("pointerenter"));
  window.dispatchEvent(new Event("blur"));
  expect(f.frames.size).toBe(0);
  f.down.dispatchEvent(new Event("pointerenter"));
  stop();
  expect(f.frames.size).toBe(0);
  const before = f.viewport.scrollTop;
  f.down.dispatchEvent(new Event("pointerenter"));
  f.down.click();
  f.frame(500);
  expect(f.viewport.scrollTop).toBe(before);
});
test("non-overflowing viewports expose no active arrows and incomplete surfaces need no resources", () => {
  const f = fixture();
  Object.defineProperty(f.viewport, "scrollHeight", { value: 100 });
  const stop = installHoverScroll(f.root, f.viewport);
  expect(f.up.disabled).toBe(true);
  expect(f.down.disabled).toBe(true);
  f.down.dispatchEvent(new Event("pointerenter"));
  expect(f.frames.size).toBe(0);
  stop();
  f.up.remove();
  expect(() => installHoverScroll(f.root, f.viewport)()).not.toThrow();
});
