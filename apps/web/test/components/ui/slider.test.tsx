import { expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Slider } from "../../../src/components/ui/slider";
import { createSliderValue } from "../../../src/components/ui/slider-value";
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

test("uses genuine Radix range/keyboard semantics and source changes stay in the slider leaf", () => {
  const source = createSliderValue([10]);
  let parentRenders = 0;
  function Parent() {
    parentRenders++;
    return <Slider aria-label="Clock" valueSource={source} min={0} max={100} step={1} />;
  }
  const view = render(<Parent />);
  const before = parentRenders;
  act(() => source.set([75]));
  expect(screen.getByRole("slider", { name: "Clock" })).toHaveAttribute("aria-valuenow", "75");
  expect(parentRenders).toBe(before);
  const change = vi.fn();
  view.rerender(<Slider aria-label="Keyboard" defaultValue={[20]} onValueChange={change} />);
  fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
  expect(change).toHaveBeenCalledWith([21]);
  view.rerender(<Slider key="range" aria-label="Range" defaultValue={[20, 80]} />);
  expect(screen.getAllByRole("slider")).toHaveLength(2);
});
