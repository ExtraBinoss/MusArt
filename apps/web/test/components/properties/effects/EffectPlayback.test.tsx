import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createEffect } from "@musart/core";
import { setup } from "../../../support/ui";
import { EffectPlayback } from "../../../../src/components/properties/effects/EffectPlayback";
import { freezeEffectPreviews } from "../../../../src/state/session/effect-preview";

afterEach(() => vi.restoreAllMocks());
it("animates explicit phase imperatively, freezes on outside input, and cancels on Escape", () => {
  const d = setup(),
    effect = createEffect("ripple"),
    change = vi.fn(),
    cancel = vi.fn();
  let now = 0,
    callback: FrameRequestCallback | undefined;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    callback = cb;
    return 1;
  });
  const canceled = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const result = d.mount(
    <EffectPlayback
      engine={d.engine}
      effect={effect}
      disabled={false}
      onChange={change}
      onCancel={cancel}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Animer" }));
  now = 100;
  act(() => callback?.(now));
  expect(change).toHaveBeenLastCalledWith({ time: 0.1 }, true);
  expect(screen.getByLabelText("Phase affichée")).toHaveTextContent("0.10 s");
  fireEvent.pointerDown(document.body);
  expect(change).toHaveBeenLastCalledWith({ time: 0.1 });
  expect(canceled).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Animer" }));
  now = 300;
  act(() => callback?.(now));
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(cancel).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Phase affichée")).toHaveTextContent("0.00 s");
  fireEvent.click(screen.getByRole("button", { name: "Animer" }));
  result.unmount();
  expect(cancel).toHaveBeenCalledTimes(2);
  freezeEffectPreviews(d.engine);
  expect(cancel).toHaveBeenCalledTimes(2);
});
