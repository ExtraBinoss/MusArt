import { createElement, useRef } from "react";
import { expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  useVirtualRows,
  LAYER_ROW_HEIGHT,
} from "../../../../src/components/layers/tree/use-virtual-rows";
test("bounds mounted rows to the viewport and overscan while scrolling large documents", () => {
  const disconnect = vi.spyOn(ResizeObserver.prototype, "disconnect");
  function List() {
    const viewport = useRef<HTMLDivElement>(null);
    const list = useVirtualRows(10000, viewport);
    return createElement(
      "div",
      { ref: viewport, onScroll: list.onScroll, "data-testid": "list" },
      createElement("output", null, `${list.first}:${list.last}:${list.height}`),
    );
  }
  const view = render(createElement(List));
  expect(screen.getByRole("status")).toHaveTextContent(`0:19:${10000 * LAYER_ROW_HEIGHT}`);
  fireEvent.scroll(screen.getByTestId("list"), { target: { scrollTop: 3600 } });
  expect(screen.getByRole("status")).toHaveTextContent(`95:114:${10000 * LAYER_ROW_HEIGHT}`);
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});

test("native scroll metrics advance without React commits until the rendered row window changes", () => {
  const commits = vi.fn();
  let api!: ReturnType<typeof useVirtualRows>;
  function List() {
    const viewport = useRef<HTMLDivElement>(null);
    api = useVirtualRows(150, viewport);
    commits();
    return createElement("div", { ref: viewport, onScroll: api.onScroll, "data-testid": "scroll" });
  }
  render(createElement(List));
  const before = commits.mock.calls.length,
    node = screen.getByTestId("scroll");
  for (const top of [1, 25, 50, 90, 135, 175])
    fireEvent.scroll(node, { target: { scrollTop: top } });
  expect(commits).toHaveBeenCalledTimes(before);
  fireEvent.scroll(node, { target: { scrollTop: 181 } });
  expect(commits).toHaveBeenCalledTimes(before + 1);
  const write = vi.fn();
  Object.defineProperty(node, "scrollTop", { set: write, configurable: true });
  act(() => api.reveal(node, 6));
  expect(write).not.toHaveBeenCalled();
});

test("selection reveal uses cached dimensions without post-commit layout reads or redundant scroll writes", () => {
  let reveal!: () => void;
  function List() {
    const viewport = useRef<HTMLDivElement>(null),
      list = useVirtualRows(10000, viewport);
    reveal = () => list.reveal(viewport.current!, 100);
    return createElement("div", { ref: viewport, "data-testid": "cached" });
  }
  render(createElement(List));
  const node = screen.getByTestId("cached"),
    height = vi.fn(() => 300),
    readTop = vi.fn(() => 0),
    writeTop = vi.fn();
  Object.defineProperties(node, {
    clientHeight: { get: height, configurable: true },
    scrollTop: { get: readTop, set: writeTop, configurable: true },
  });
  act(reveal);
  act(reveal);
  expect(height).not.toHaveBeenCalled();
  expect(readTop).not.toHaveBeenCalled();
  expect(writeTop).toHaveBeenCalledExactlyOnceWith(3468);
});

test("offscreen reveal waits for the selection to paint and cancels superseded work", () => {
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  let schedule!: (current: () => boolean) => () => void;
  function List() {
    const viewport = useRef<HTMLDivElement>(null),
      list = useVirtualRows(10000, viewport);
    schedule = (current) => list.scheduleReveal(viewport.current!, 100, current);
    return createElement("div", { ref: viewport, "data-testid": "deferred" });
  }
  const view = render(createElement(List)),
    node = screen.getByTestId("deferred"),
    write = vi.fn();
  Object.defineProperty(node, "scrollTop", { set: write, configurable: true });
  let cancel = () => {};
  act(() => {
    cancel = schedule(() => true);
  });
  expect(write).not.toHaveBeenCalled();
  const first = frames.get(1)!;
  frames.delete(1);
  act(() => first(0));
  expect(write).not.toHaveBeenCalled();
  cancel();
  expect(frames.size).toBe(0);
  act(() => {
    cancel = schedule(() => false);
  });
  const third = frames.get(3)!;
  frames.delete(3);
  act(() => third(0));
  const fourth = frames.get(4)!;
  frames.delete(4);
  act(() => fourth(0));
  expect(write).not.toHaveBeenCalled();
  cancel();
  view.unmount();
  vi.unstubAllGlobals();
});
