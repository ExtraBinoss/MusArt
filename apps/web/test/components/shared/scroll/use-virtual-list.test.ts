import { createElement, useRef } from "react";
import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useVirtualList } from "../../../../src/components/shared/scroll/use-virtual-list";
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
