import { act, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { createElement, useRef } from "react";
import { useMarquee } from "../../../src/canvas/selection/use-marquee";

test("retains one DOM box and updates bounds without rerendering its React owner", () => {
  let renders = 0;
  let marquee!: ReturnType<typeof useMarquee>;
  function Host() {
    renders++;
    const element = useRef<HTMLDivElement>(null);
    marquee = useMarquee(element);
    return createElement("div", { ref: element, "data-testid": "box", hidden: true });
  }
  const view = render(createElement(Host)),
    box = screen.getByTestId("box"),
    initial = marquee;
  expect(box).not.toBeVisible();
  act(() => marquee.show({ x: 100, y: 80 }, { x: 20, y: 10 }));
  expect(box).toBeVisible();
  expect(box).toHaveStyle({ left: "20px", top: "10px", width: "80px", height: "70px" });
  act(() => marquee.show({ x: 100, y: 80 }, { x: 160, y: 120 }));
  expect(box).toHaveStyle({ left: "100px", top: "80px", width: "60px", height: "40px" });
  expect(renders).toBe(1);
  view.rerender(createElement(Host));
  expect(marquee).toBe(initial);
  act(() => marquee.clear());
  expect(box).not.toBeVisible();
  view.unmount();
  expect(() => {
    marquee.show({ x: 1, y: 1 }, { x: 2, y: 2 });
    marquee.clear();
  }).not.toThrow();
});
