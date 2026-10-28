import { expect, test } from "vitest";
import { render } from "@testing-library/react";
import { PaletteVector } from "../../../src/components/assets/PaletteVector";
test("preserves vector paint, transforms and original brand paths", () => {
  const view = render(
    <PaletteVector item={{ viewBox: "0 0 10 10", path: "M0 0H10V10Z", strokeOnly: true }} />,
  );
  expect(view.container.querySelector("svg")).toHaveAttribute("fill", "none");
  expect(view.container.querySelector("path")).toHaveAttribute("d", "M0 0H10V10Z");
  view.rerender(
    <PaletteVector
      item={{
        viewBox: "0 0 10 10",
        parts: [
          {
            path: "M0 0H10",
            fill: "#ff0000",
            stroke: "#000000",
            strokeWidth: 2,
            opacity: 0.5,
            fillRule: "evenodd",
            matrix: [1, 0, 0, 1, 2, 3],
          },
          { path: "M1 1H5" },
        ],
      }}
    />,
  );
  expect(view.container.querySelector("svg")).toHaveAttribute("data-preserve-paint", "true");
  expect(view.container.querySelector("path")).toHaveAttribute("transform", "matrix(1 0 0 1 2 3)");
  expect(view.container.querySelectorAll("path")[1]).toHaveAttribute("stroke", "none");
});
