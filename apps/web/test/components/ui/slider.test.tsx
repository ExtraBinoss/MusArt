import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Slider } from "../../../src/components/ui/slider";
test("supports controlled, default and range values", () => {
  render(
    <>
      <Slider aria-label="Controlled" value={[50]} />
      <Slider aria-label="Default" defaultValue={[25]} />
      <Slider aria-label="Range" />
    </>,
  );
  expect(screen.getAllByRole("slider")).toHaveLength(3);
  expect(screen.getAllByRole("slider")[0]).toHaveAttribute("aria-valuenow", "50");
});
