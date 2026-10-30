import { createElement, useRef } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useVirtualList } from "../../../../src/components/shared/scroll/use-virtual-list";
const commits = vi.hoisted(() => ({ synchronous: vi.fn() }));
vi.mock("react-dom", async (load) => {
  const actual = await load<typeof import("react-dom")>();
  return {
    ...actual,
    flushSync<T>(callback: () => T) {
      commits.synchronous();
      return actual.flushSync(callback);
    },
  };
});
afterEach(() => {
  commits.synchronous.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
test("large fixed-height catalogs mount a bounded range and clamp it after filtering", () => {
  const disconnect = vi.spyOn(ResizeObserver.prototype, "disconnect");
  function List({ count }: { count: number }) {
    const viewport = useRef<HTMLDivElement>(null),
      list = useVirtualList(count, 35, viewport);
    return createElement(
      "div",
      { ref: list.attachViewport, "data-testid": "viewport" },
      createElement("output", null, `${list.first}:${list.last}:${list.height}`),
    );
  }
  const view = render(createElement(List, { count: 500 }));
  expect(screen.getByRole("status")).toHaveTextContent("0:15:17500");
  fireEvent.scroll(screen.getByTestId("viewport"), { target: { scrollTop: 3500 } });
  expect(screen.getByRole("status")).toHaveTextContent("96:115:17500");
  view.rerender(createElement(List, { count: 3 }));
  expect(screen.getByRole("status")).toHaveTextContent("0:3:105");
  view.unmount();
  expect(disconnect).toHaveBeenCalled();
});

test("native scrolling inside the retained window does not republish React state", () => {
  let renders = 0;
  function List() {
    renders++;
    const viewport = useRef<HTMLDivElement>(null),
      list = useVirtualList(500, 35, viewport);
    return createElement(
      "div",
      { ref: list.attachViewport, "data-testid": "viewport" },
      createElement("output", null, `${list.first}:${list.last}`),
    );
  }
  render(createElement(List));
  const before = renders;
  for (const scrollTop of [1, 20, 35, 70, 100, 139])
    fireEvent.scroll(screen.getByTestId("viewport"), { target: { scrollTop } });
  expect(renders).toBe(before);
  fireEvent.scroll(screen.getByTestId("viewport"), { target: { scrollTop: 140 } });
  expect(renders).toBe(before + 1);
  expect(screen.getByRole("status")).toHaveTextContent("0:19");
  for (const scrollTop of [175, 210, 279])
    fireEvent.scroll(screen.getByTestId("viewport"), { target: { scrollTop } });
  expect(renders).toBe(before + 1);
  fireEvent.scroll(screen.getByTestId("viewport"), { target: { scrollTop: 280 } });
  expect(renders).toBe(before + 2);
  expect(screen.getByRole("status")).toHaveTextContent("4:23");
});

test("scroll uses cached dimensions, supports late portal attachment and removes its listener", () => {
  let renders = 0;
  function List({ shown }: { shown: boolean }) {
    renders++;
    const viewport = useRef<HTMLDivElement>(null);
    const list = useVirtualList(500, 24, viewport, 4);
    return shown
      ? createElement(
          "div",
          { ref: list.attachViewport, "data-testid": "viewport" },
          createElement("output", null, `${list.first}:${list.last}`),
        )
      : null;
  }
  const view = render(createElement(List, { shown: false }));
  view.rerender(createElement(List, { shown: true }));
  const viewport = screen.getByTestId("viewport");
  const dimensions = vi.spyOn(viewport, "clientHeight", "get");
  const before = renders;
  fireEvent.scroll(viewport, { target: { scrollTop: 2400 } });
  expect(screen.getByRole("status")).toHaveTextContent("96:118");
  expect(renders).toBe(before + 1);
  expect(dimensions).not.toHaveBeenCalled();
  view.unmount();
  const after = renders;
  fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
  expect(renders).toBe(after);
  dimensions.mockRestore();
});
test("explicit synchronous scroll admission commits only the changed window before the native event returns", () => {
  let resize!: ResizeObserverCallback,
    renders = 0,
    stale!: ReturnType<typeof useVirtualList>["onScroll"];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  function List() {
    renders++;
    const viewport = useRef<HTMLDivElement>(null),
      { first, last, attachViewport, onScroll } = useVirtualList(500, 24, viewport, 4, {
        synchronousScroll: true,
      });
    stale = onScroll;
    return createElement(
      "div",
      { ref: attachViewport, onScroll, "data-testid": "viewport" },
      createElement("output", null, `${first}:${last}`),
    );
  }
  const view = render(createElement(List)),
    viewport = screen.getByTestId("viewport");
  expect(commits.synchronous).not.toHaveBeenCalled();
  act(() => {
    viewport.scrollTop = 2400;
    viewport.dispatchEvent(new Event("scroll"));
    expect(screen.getByRole("status")).toHaveTextContent("96:118");
  });
  expect(commits.synchronous).toHaveBeenCalledOnce();
  const committedRenders = renders;
  act(() => {
    for (const top of [2401, 2420, 2460]) {
      viewport.scrollTop = top;
      viewport.dispatchEvent(new Event("scroll"));
    }
  });
  expect(renders).toBe(committedRenders);
  expect(commits.synchronous).toHaveBeenCalledOnce();
  Object.defineProperty(viewport, "clientHeight", { value: 100, configurable: true });
  act(() => resize([], {} as ResizeObserver));
  expect(screen.getByRole("status")).toHaveTextContent("96:113");
  expect(commits.synchronous).toHaveBeenCalledOnce();
  view.unmount();
  act(() => {
    viewport.scrollTop = 0;
    viewport.dispatchEvent(new Event("scroll"));
    stale({ currentTarget: viewport });
  });
  expect(commits.synchronous).toHaveBeenCalledOnce();
  expect(renders).toBe(committedRenders + 1);
});
test("default catalogs retain deferred native scroll publication and never request flushSync", () => {
  function List() {
    const viewport = useRef<HTMLDivElement>(null),
      { first, last, attachViewport } = useVirtualList(500, 24, viewport);
    return createElement(
      "div",
      { ref: attachViewport, "data-testid": "viewport" },
      createElement("output", null, `${first}:${last}`),
    );
  }
  const view = render(createElement(List)),
    viewport = screen.getByTestId("viewport");
  act(() => {
    viewport.scrollTop = 2400;
    viewport.dispatchEvent(new Event("scroll"));
    expect(screen.getByRole("status")).toHaveTextContent("0:18");
  });
  expect(screen.getByRole("status")).toHaveTextContent("96:118");
  expect(commits.synchronous).not.toHaveBeenCalled();
  view.unmount();
});
