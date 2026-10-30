import { expect, test } from "vitest";
import { render } from "@testing-library/react";
import { ModeIcon } from "../../../src/components/motion/ModeIcon";
test("preserves the supplied static and motion artwork", () => {
  const view = render(<ModeIcon mode="static" size={24} />);
  expect(view.container.querySelector("rect")).toHaveAttribute("rx", "3.6");
  view.rerender(<ModeIcon mode="motion" />);
  expect(view.container.querySelector("rect")).toBeNull();
  expect(view.container.querySelectorAll("path")).toHaveLength(2);
  expect(view.container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(view.container.querySelector("svg")).toHaveAttribute("stroke-width", "2.4");
});
