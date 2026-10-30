import { afterEach, expect, it, vi } from "vitest";
import { watchDisplayDensity } from "../../../src/canvas/render/display-density";
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("tracks real DPR changes without zoom, rearms its media query and ignores same-DPR resizes", () => {
  vi.useFakeTimers();
  let ratio = 1;
  vi.spyOn(window, "devicePixelRatio", "get").mockImplementation(() => ratio);
  const queries: MediaQueryList[] = [];
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const target = new EventTarget();
    const media = {
      media: query,
      matches: false,
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    } as MediaQueryList;
    queries.push(media);
    return media;
  });
  const update = vi.fn(),
    stop = watchDisplayDensity(1.5, update);
  vi.advanceTimersByTime(140);
  expect(update).toHaveBeenLastCalledWith(1.5);
  window.dispatchEvent(new Event("resize"));
  vi.advanceTimersByTime(200);
  expect(update).toHaveBeenCalledOnce();
  ratio = 2;
  queries[0]!.dispatchEvent(new Event("change"));
  window.dispatchEvent(new Event("resize"));
  vi.advanceTimersByTime(139);
  expect(update).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(1);
  expect(update).toHaveBeenLastCalledWith(3);
  expect(queries[1]!.media).toBe("(resolution: 2dppx)");
  ratio = 1.25;
  queries[1]!.dispatchEvent(new Event("change"));
  stop();
  vi.advanceTimersByTime(200);
  expect(update).toHaveBeenCalledTimes(2);
  window.dispatchEvent(new Event("resize"));
  expect(update).toHaveBeenCalledTimes(2);
});
it("invalid DPR uses one and an obsolete owner cannot publish after cleanup", () => {
  vi.useFakeTimers();
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(NaN);
  const update = vi.fn(),
    stop = watchDisplayDensity(2, update);
  stop();
  vi.advanceTimersByTime(200);
  expect(update).not.toHaveBeenCalled();
  const next = watchDisplayDensity(2, update);
  vi.advanceTimersByTime(140);
  expect(update).toHaveBeenCalledWith(2);
  next();
});
