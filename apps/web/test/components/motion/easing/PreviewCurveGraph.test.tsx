import { act, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { setup } from "../../../support/ui";
import { createEasingPreview } from "../../../../src/components/motion/easing/preview";
import { PreviewCurveGraph } from "../../../../src/components/motion/easing/PreviewCurveGraph";

it("updates only its hover graph, disables transient handles and unsubscribes on unmount", () => {
  const d = setup(),
    preview = createEasingPreview(),
    onChange = vi.fn(),
    released = vi.fn();
  const source = {
    ...preview,
    subscribe(this: void, listener: () => void) {
      const stop = preview.subscribe(listener);
      return () => {
        stop();
        released();
      };
    },
  };
  const view = d.mount(
    <PreviewCurveGraph preview={source} easing={{ type: "linear" }} onChange={onChange} />,
  );
  const curve = () => document.querySelector(".motion-easing-curve")!.getAttribute("d");
  const base = curve();
  act(() => preview.set({ type: "cubicBezier", x1: 0.4, y1: 0, x2: 1, y2: 1 }));
  expect(curve()).not.toBe(base);
  expect(screen.getAllByRole("slider")).toHaveLength(2);
  for (const slider of screen.getAllByRole("slider")) expect(slider).toBeDisabled();
  expect(onChange).not.toHaveBeenCalled();
  act(() => preview.set(null));
  expect(curve()).toBe(base);
  expect(screen.queryByRole("slider")).toBeNull();
  view.unmount();
  expect(released).toHaveBeenCalledExactlyOnceWith();
  act(() => preview.set({ type: "hold" }));
  expect(onChange).not.toHaveBeenCalled();
});
