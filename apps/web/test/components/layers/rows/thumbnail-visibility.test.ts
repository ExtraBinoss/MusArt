import { afterEach, beforeEach, expect, test, vi, type Mock } from "vitest";
import { observeLayerThumbnail } from "../../../../src/components/layers/rows/thumbnail-visibility";

const stops: (() => void)[] = [];
let time = 0;
let callbacks: IntersectionObserverCallback[];
let observe: Mock<(target: Element) => void>,
  unobserve: Mock<(target: Element) => void>,
  disconnect: Mock<() => void>;
let construct: Mock<(options: IntersectionObserverInit) => void>;
beforeEach(() => {
  time = 0;
  callbacks = [];
  observe = vi.fn<(target: Element) => void>();
  unobserve = vi.fn<(target: Element) => void>();
  disconnect = vi.fn<() => void>();
  construct = vi.fn<(options: IntersectionObserverInit) => void>();
  vi.spyOn(performance, "now").mockImplementation(() => time);
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
        callbacks.push(callback);
        construct(options);
      }
      observe = observe;
      unobserve = unobserve;
      disconnect = disconnect;
    },
  );
});
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function entry(target: Element, visible: boolean, at = time): IntersectionObserverEntry {
  return { target, isIntersecting: visible, time: at } as IntersectionObserverEntry;
}
function emit(index: number, entries: IntersectionObserverEntry[]) {
  callbacks[index]!(entries, {} as IntersectionObserver);
}
test("one lazy browser observer serves all row cards and disconnects exactly with its final owner", () => {
  const targets = Array.from({ length: 50 }, () => document.createElement("span"));
  const listeners = targets.map(() => vi.fn());
  targets.forEach((target, index) => stops.push(observeLayerThumbnail(target, listeners[index]!)));
  expect(construct).toHaveBeenCalledExactlyOnceWith({ rootMargin: "32px" });
  expect(observe).toHaveBeenCalledTimes(50);
  emit(0, [entry(targets[0]!, true), entry(targets[1]!, false)]);
  expect(listeners[0]).toHaveBeenCalledExactlyOnceWith(true);
  expect(listeners[1]).toHaveBeenCalledExactlyOnceWith(false);
  expect(listeners[2]).not.toHaveBeenCalled();
  stops.slice(0, -1).forEach((stop) => stop());
  expect(unobserve).toHaveBeenCalledTimes(49);
  expect(disconnect).not.toHaveBeenCalled();
  stops.at(-1)!();
  expect(unobserve).toHaveBeenCalledTimes(50);
  expect(disconnect).toHaveBeenCalledOnce();
  stops.forEach((stop) => stop());
  expect(disconnect).toHaveBeenCalledOnce();
});
test("queued entries from removed targets or a retired observer cannot update new row owners", () => {
  const first = document.createElement("span"),
    keep = document.createElement("span");
  const a = vi.fn(),
    b = vi.fn();
  const stopA = observeLayerThumbnail(first, a),
    stopKeep = observeLayerThumbnail(keep, vi.fn());
  stops.push(stopA, stopKeep);
  stopA();
  emit(0, [entry(first, true)]);
  expect(a).not.toHaveBeenCalled();
  stopKeep();
  stops.push(observeLayerThumbnail(first, b));
  expect(construct).toHaveBeenCalledTimes(2);
  emit(0, [entry(first, true)]);
  expect(b).not.toHaveBeenCalled();
  emit(1, [entry(first, false)]);
  expect(b).toHaveBeenCalledExactlyOnceWith(false);
});
test("reused target nodes reject old timestamps and obsolete cleanup cannot unobserve their replacement", () => {
  const target = document.createElement("span"),
    a = vi.fn(),
    b = vi.fn();
  stops.push(observeLayerThumbnail(target, a));
  time = 20;
  stops.push(observeLayerThumbnail(target, b));
  expect(construct).toHaveBeenCalledOnce();
  expect(unobserve).toHaveBeenCalledExactlyOnceWith(target);
  stops[0]!();
  expect(unobserve).toHaveBeenCalledOnce();
  emit(0, [entry(target, true, 19)]);
  expect(a).not.toHaveBeenCalled();
  expect(b).not.toHaveBeenCalled();
  emit(0, [entry(target, true, 20)]);
  expect(b).toHaveBeenCalledExactlyOnceWith(true);
});
