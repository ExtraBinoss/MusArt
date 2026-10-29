import { afterEach, expect, test, vi } from "vitest";
import { createLiveNumberMotion } from "../../../src/components/shared/live-number";

const active = "is-live-number-changing";
const originalMatchMedia = window.matchMedia;
afterEach(() => {
  vi.useRealTimers();
  window.matchMedia = originalMatchMedia;
});
function fixture() {
  vi.useFakeTimers();
  const media = new EventTarget() as MediaQueryList;
  Object.defineProperty(media, "matches", { value: false, writable: true });
  window.matchMedia = vi.fn(() => media);
  const host = document.createElement("span");
  const motion = createLiveNumberMotion(host);
  return { host, media, motion };
}

test("publishes every exact string immediately and resets without a visual burst", () => {
  const { host, motion } = fixture();
  motion.reset("0.000 ms");
  expect(host.textContent).toBe("0.000 ms");
  expect(host).not.toHaveClass(active);
  motion.set("1.001 ms");
  expect(host.textContent).toBe("1.001 ms");
  expect(host).toHaveClass(active);
  motion.set("-0.125 ms");
  expect(host.textContent).toBe("-0.125 ms");
  motion.reset("1/30000");
  expect(host.textContent).toBe("1/30000");
  expect(host).not.toHaveClass(active);
  expect(vi.getTimerCount()).toBe(0);
  motion.dispose();
});

test("keeps one timer during continuous ticks and settles 100ms after the last actual change", () => {
  const { host, motion } = fixture();
  const add = vi.spyOn(host.classList, "add"),
    remove = vi.spyOn(host.classList, "remove");
  for (let tick = 0; tick < 60; tick++) {
    motion.set(String(tick));
    expect(host.textContent).toBe(String(tick));
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(16);
  }
  expect(add).toHaveBeenCalledExactlyOnceWith(active);
  expect(remove).not.toHaveBeenCalled();
  vi.advanceTimersByTime(83);
  expect(host).toHaveClass(active);
  motion.set("59"); // An unchanged value does not extend the burst.
  vi.advanceTimersByTime(1);
  expect(host).not.toHaveClass(active);
  expect(remove).toHaveBeenCalledExactlyOnceWith(active);
  expect(vi.getTimerCount()).toBe(0);
  motion.dispose();
});

test("supports an immediate input.value port and corrects external edits", () => {
  fixture().motion.dispose();
  const host = document.createElement("input");
  const write = vi.fn((text: string) => {
    host.value = text;
  });
  const motion = createLiveNumberMotion(host, { read: () => host.value, write });
  motion.set("1001.250");
  expect(host.value).toBe("1001.250");
  host.value = "typing";
  motion.set("1001.250");
  expect(write).toHaveBeenCalledTimes(2);
  expect(host.value).toBe("1001.250");
  expect(vi.getTimerCount()).toBe(1);
  motion.dispose();
});

test("reduced motion stops an active burst and keeps subsequent values exact without timers", () => {
  const { host, media, motion } = fixture();
  motion.set("1");
  Object.defineProperty(media, "matches", { value: true, writable: true });
  media.dispatchEvent(new Event("change"));
  expect(host).not.toHaveClass(active);
  expect(vi.getTimerCount()).toBe(0);
  motion.set("2");
  expect(host.textContent).toBe("2");
  expect(host).not.toHaveClass(active);
  expect(vi.getTimerCount()).toBe(0);
  motion.dispose();
});

test("a hidden document clears the effect while retaining the latest value", () => {
  const { host, motion } = fixture();
  motion.set("3");
  const previous = Object.getOwnPropertyDescriptor(document, "hidden");
  try {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(host).not.toHaveClass(active);
    expect(vi.getTimerCount()).toBe(0);
    motion.set("4");
    expect(host.textContent).toBe("4");
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    if (previous) Object.defineProperty(document, "hidden", previous);
    else Reflect.deleteProperty(document, "hidden");
    motion.dispose();
  }
});

test("dispose removes timers/listeners/classes, ignores stale writes and safely replaces an owner", () => {
  const { host, media, motion } = fixture();
  const removeMedia = vi.spyOn(media, "removeEventListener"),
    removeDocument = vi.spyOn(document, "removeEventListener");
  motion.set("old");
  const replacement = createLiveNumberMotion(host);
  expect(removeMedia).toHaveBeenCalledWith("change", expect.any(Function));
  expect(removeDocument).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
  replacement.set("new");
  motion.dispose();
  motion.set("stale");
  motion.reset("also stale");
  expect(host.textContent).toBe("new");
  expect(host).toHaveClass(active);
  replacement.dispose();
  replacement.dispose();
  expect(host).not.toHaveClass(active, "live-number-motion");
  expect(vi.getTimerCount()).toBe(0);
});
