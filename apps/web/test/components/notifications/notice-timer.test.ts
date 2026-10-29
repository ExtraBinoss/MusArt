import { afterEach, expect, test, vi } from "vitest";
import { createNoticeTimer } from "../../../src/components/notifications/notice-timer";
afterEach(() => vi.useRealTimers());
test("retains reading time across independent hover/focus/copy pauses and expires once", () => {
  vi.useFakeTimers();
  const expired = vi.fn(),
    timer = createNoticeTimer(expired);
  timer.restart(4000);
  vi.advanceTimersByTime(1000);
  timer.pause("hover", true);
  timer.pause("hover", true);
  timer.pause("focus", true);
  vi.advanceTimersByTime(10000);
  timer.pause("hover", false);
  vi.advanceTimersByTime(10000);
  expect(expired).not.toHaveBeenCalled();
  timer.pause("copy", true);
  timer.pause("focus", false);
  timer.pause("copy", false);
  vi.advanceTimersByTime(2999);
  expect(expired).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(expired).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(10000);
  expect(expired).toHaveBeenCalledOnce();
  timer.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
test("replacement starts a fresh timeout, cleanup prevents stale expiry and invalid durations fail", () => {
  vi.useFakeTimers();
  const expired = vi.fn(),
    timer = createNoticeTimer(expired);
  timer.restart(4000);
  vi.advanceTimersByTime(3000);
  timer.restart(8000);
  vi.advanceTimersByTime(7999);
  expect(expired).not.toHaveBeenCalled();
  timer.clear();
  vi.advanceTimersByTime(10000);
  expect(expired).not.toHaveBeenCalled();
  for (const value of [-1, NaN, Infinity]) expect(() => timer.restart(value)).toThrow();
  timer.restart(0);
  vi.advanceTimersByTime(0);
  expect(expired).toHaveBeenCalledOnce();
  timer.dispose();
});
