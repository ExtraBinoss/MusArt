import { useState } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { MotionEasing } from "@musart/core";
import { setup } from "../../../support/ui";
import { CurveGraph } from "../../../../src/components/motion/easing/CurveGraph";
import { pointer } from "../support";

it("exposes real keyboard/pointer curve controls and cancels a pointer draft", () => {
  const d = setup(),
    changed = vi.fn();
  const initial: MotionEasing = { type: "cubicBezier", x1: 0.25, y1: 0, x2: 0.75, y2: 1 };
  function Host() {
    const [curve, setCurve] = useState(initial);
    return (
      <CurveGraph
        easing={curve}
        onChange={(value) => {
          changed(value);
          setCurve(value);
        }}
      />
    );
  }
  d.mount(<Host />);
  const first = screen.getByRole("slider", { name: "Point de contrôle Bézier 1" });
  vi.spyOn(first, "hasPointerCapture").mockReturnValue(true);
  const release = vi.spyOn(first, "releasePointerCapture");
  fireEvent.keyDown(first, { key: "ArrowRight" });
  expect(changed).toHaveBeenLastCalledWith({ ...initial, x1: 0.26 });
  const graph = screen.getByRole("group", { name: "Aperçu de la courbe d’interpolation" });
  vi.spyOn(graph, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 244,
    height: 140,
  } as DOMRect);
  act(() => pointer(first, "pointerdown", 73, 116));
  act(() => pointer(first, "pointermove", 122, 70));
  expect(changed).toHaveBeenLastCalledWith({ ...initial, x1: 0.5, y1: 0.5 });
  act(() => pointer(first, "pointercancel", 122, 70));
  expect(changed).toHaveBeenLastCalledWith({ ...initial, x1: 0.26 });
  expect(release).toHaveBeenCalledWith(7);
  act(() => pointer(first, "pointerdown", 73, 116));
  act(() => pointer(first, "pointermove", 122, 70));
  fireEvent.keyDown(first, { key: "Escape" });
  expect(changed).toHaveBeenLastCalledWith({ ...initial, x1: 0.26 });
  expect(release).toHaveBeenCalledTimes(2);
  const calls = changed.mock.calls.length;
  act(() => pointer(first, "lostpointercapture", 122, 70));
  act(() => pointer(first, "pointermove", 150, 70));
  expect(changed).toHaveBeenCalledTimes(calls);
});

it("shows numeric spring/Hold previews without pretending they have Bézier handles", () => {
  const d = setup();
  const view = d.mount(
    <CurveGraph easing={{ type: "spring", bounce: 0.7, response: 14 }} onChange={vi.fn()} />,
  );
  expect(screen.queryByRole("slider")).toBeNull();
  const spring = document.querySelector(".motion-easing-curve")!.getAttribute("d");
  view.rerender(<CurveGraph easing={{ type: "hold" }} onChange={vi.fn()} />);
  expect(document.querySelector(".motion-easing-curve")!.getAttribute("d")).not.toBe(spring);
});
