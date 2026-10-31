import { afterEach, expect, it, vi } from "vitest";
import { getUiPresentation } from "../../../src/state/session/ui-presentation";
afterEach(() => vi.useRealTimers());
it("shares a port per window and coalesces overlapping leases into one timer", () => {
  vi.useFakeTimers();
  const port = getUiPresentation(),
    notify = vi.fn(),
    stop = port.subscribe(notify);
  expect(getUiPresentation(window)).toBe(port);
  const frame = document.body.appendChild(document.createElement("iframe"));
  expect(getUiPresentation(frame.contentWindow!)).not.toBe(port);
  const first = port.hold();
  expect(port.busy()).toBe(true);
  expect(notify).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(100);
  const second = port.hold();
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(150);
  expect(port.busy()).toBe(true);
  first();
  first();
  expect(notify).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(99);
  expect(port.busy()).toBe(true);
  vi.advanceTimersByTime(1);
  expect(port.busy()).toBe(false);
  expect(notify).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  second();
  stop();
  frame.remove();
});
it("releases early without letting an expired owner release a newer entrance", () => {
  vi.useFakeTimers();
  const port = getUiPresentation(),
    one = port.hold();
  vi.advanceTimersByTime(250);
  const two = port.hold();
  one();
  expect(port.busy()).toBe(true);
  two();
  two();
  expect(port.busy()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
it("keeps fanout to one timer and no notifications on steady busy reads", () => {
  vi.useFakeTimers();
  const port = getUiPresentation(),
    notify = vi.fn(),
    stop = port.subscribe(notify);
  const releases = Array.from({ length: 1000 }, () => port.hold());
  for (let i = 0; i < 100; i++) expect(port.busy()).toBe(true);
  expect(vi.getTimerCount()).toBe(1);
  expect(notify).toHaveBeenCalledOnce();
  releases.forEach((release) => release());
  expect(vi.getTimerCount()).toBe(0);
  expect(notify).toHaveBeenCalledTimes(2);
  stop();
  const release = port.hold();
  release();
  expect(notify).toHaveBeenCalledTimes(2);
});
it("cleans timers and lifecycle listeners on hidden/pagehide and ignores stale cleanup", () => {
  vi.useFakeTimers();
  const port = getUiPresentation(),
    remove = vi.spyOn(window, "removeEventListener"),
    removeDocument = vi.spyOn(document, "removeEventListener");
  const release = port.hold();
  window.dispatchEvent(new Event("pagehide"));
  expect(port.busy()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledWith("pagehide", expect.any(Function));
  expect(removeDocument).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  const next = port.hold();
  release();
  expect(port.busy()).toBe(true);
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(port.busy()).toBe(false);
  const ignored = port.hold();
  ignored();
  next();
  expect(vi.getTimerCount()).toBe(0);
  hidden.mockRestore();
  remove.mockRestore();
  removeDocument.mockRestore();
});
it("reads expired leases without mutating timers, notifying or reentering admission", () => {
  vi.useFakeTimers();
  const port = getUiPresentation();
  let querying = false;
  const notify = vi.fn(() => expect(querying).toBe(false)),
    stop = port.subscribe(notify);
  const release = port.hold();
  expect(notify).toHaveBeenCalledOnce();
  vi.setSystemTime(Date.now() + 300);
  querying = true;
  for (let i = 0; i < 100; i++) expect(port.busy()).toBe(false);
  querying = false;
  expect(notify).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(1);
  release();
  expect(notify).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  stop();
});
it("ignores a captured old timer without clearing or duplicating the current timer", () => {
  vi.useFakeTimers();
  const port = getUiPresentation(),
    schedule = vi.spyOn(window, "setTimeout"),
    notify = vi.fn(),
    stop = port.subscribe(notify);
  const first = port.hold(),
    old = schedule.mock.calls.at(-1)![0];
  if (typeof old !== "function") throw Error("Expected the actual scheduled callback");
  vi.advanceTimersByTime(100);
  const second = port.hold();
  first();
  expect(schedule).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(1);
  old();
  expect(port.busy()).toBe(true);
  expect(schedule).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(1);
  expect(notify).toHaveBeenCalledOnce();
  second();
  expect(port.busy()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  expect(notify).toHaveBeenCalledTimes(2);
  old();
  expect(schedule).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  expect(notify).toHaveBeenCalledTimes(2);
  stop();
  schedule.mockRestore();
});

it.each([
  "popover-content",
  "context-menu-content",
  "context-menu-sub-content",
  "dropdown-menu-content",
  "dropdown-menu-sub-content",
])("protects the positioned %s entrance rather than only its initial mount", (slot) => {
  vi.useFakeTimers();
  const port = getUiPresentation(),
    release = port.hold();
  const content = document.body.appendChild(document.createElement("div"));
  content.dataset.slot = slot;
  content.dataset.state = "open";
  vi.advanceTimersByTime(200);
  content.dispatchEvent(new Event("animationstart", { bubbles: true }));
  vi.advanceTimersByTime(50);
  expect(port.busy()).toBe(true);
  const child = content.appendChild(document.createElement("div"));
  child.dispatchEvent(new Event("animationstart", { bubbles: true }));
  vi.advanceTimersByTime(199);
  expect(port.busy()).toBe(true);
  vi.advanceTimersByTime(1);
  expect(port.busy()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  release();
  content.remove();
});
