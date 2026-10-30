import { afterEach, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { CanvasVideoProxyActivity } from "../../../src/canvas/render/video-proxy-activity";
afterEach(() => vi.useRealTimers());
it("admits native conversion after quiet time and stops it throughout pointer gestures, wheel and playback", () => {
  vi.useFakeTimers();
  const ready = vi.fn(),
    activity = new CanvasVideoProxyActivity(ready),
    change = vi.fn(),
    stop = activity.subscribe(change);
  expect(activity.read()).toBe(false);
  vi.advanceTimersByTime(180);
  expect(activity.read()).toBe(true);
  fireEvent.pointerDown(window, { pointerId: 2 });
  expect(activity.read()).toBe(false);
  vi.advanceTimersByTime(1000);
  expect(activity.read()).toBe(false);
  fireEvent.pointerUp(window, { pointerId: 2 });
  vi.advanceTimersByTime(180);
  expect(activity.read()).toBe(true);
  fireEvent.wheel(window);
  expect(activity.read()).toBe(false);
  vi.advanceTimersByTime(180);
  activity.ready();
  expect(ready).toHaveBeenCalledOnce();
  activity.setBlocked(true);
  vi.advanceTimersByTime(1000);
  expect(activity.read()).toBe(false);
  activity.ready();
  expect(ready).toHaveBeenCalledOnce();
  activity.setBlocked(false);
  vi.advanceTimersByTime(180);
  expect(activity.read()).toBe(true);
  fireEvent.dragStart(window);
  vi.advanceTimersByTime(1000);
  expect(activity.read()).toBe(false);
  fireEvent.drop(window);
  vi.advanceTimersByTime(180);
  expect(activity.read()).toBe(true);
  stop();
  activity.dispose();
  expect(vi.getTimerCount()).toBe(0);
  expect(activity.read()).toBe(false);
});
