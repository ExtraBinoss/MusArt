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
      { ref: viewport, onScroll: list.onScroll, "data-testid": "viewport" },
      createElement("output", null, `${list.first}:${list.last}:${list.height}`),
    );
  }
  const view = render(createElement(List, { count: 500 }));
  expect(screen.getByRole("status")).toHaveTextContent("0:15:17500");
  fireEvent.scroll(screen.getByTestId("viewport"), { target: { scrollTop: 3500 } });
  expect(screen.getByRole("status")).toHaveTextContent("96:111:17500");
  view.rerender(createElement(List, { count: 3 }));
  expect(screen.getByRole("status")).toHaveTextContent("0:3:105");
  view.unmount();
  expect(disconnect).toHaveBeenCalled();
});
