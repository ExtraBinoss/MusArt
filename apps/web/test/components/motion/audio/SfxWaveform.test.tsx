import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { SfxWaveform } from "../../../../src/components/motion/audio/SfxWaveform";
it("renders a fixed continuous two-tone source envelope without frame state", () => {
  const view = render(<SfxWaveform />);
  expect(view.container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 280 42");
  view.rerender(<SfxWaveform peaks={new Float32Array([0, 0.2, 1, 0.3, 0])} />);
  expect(view.container.querySelectorAll("path")).toHaveLength(2);
  expect(view.container.querySelector("path")?.getAttribute("d")).toContain("Q");
  expect(view.container.querySelector("svg")?.hasAttribute("data-preparing")).toBe(false);
});
