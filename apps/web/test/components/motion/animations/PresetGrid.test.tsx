import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MOTION_ANIMATION_PRESETS } from "@musart/core";
import { expect, it, vi } from "vitest";
import { PresetGrid } from "../../../../src/components/motion/animations/PresetGrid";
import { setup } from "../../../support/ui";

vi.mock("../../../../src/components/motion/animations/PresetPreview", () => ({
  PresetPreview: () => null,
}));

it("bounds mounted cards and focuses/apply an offscreen last preset with End", async () => {
  const d = setup(),
    apply = vi.fn();
  d.mount(
    <PresetGrid
      engine={d.engine}
      entries={MOTION_ANIMATION_PRESETS}
      apply={apply}
      busy={false}
      empty="Empty"
      onError={vi.fn()}
    />,
  );
  const first = screen.getAllByRole("listitem")[0]!.querySelector("button")!;
  expect(screen.getAllByRole("listitem").length).toBeLessThan(25);
  const viewport = document.querySelector(".animation-preset-scroll")!;
  Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 220 });
  fireEvent.keyDown(first, { key: "End" });
  const last = MOTION_ANIMATION_PRESETS.at(-1)!;
  await waitFor(() => expect(screen.getByRole("button", { name: last.name })).toHaveFocus());
  fireEvent.click(screen.getByRole("button", { name: last.name }));
  expect(apply).toHaveBeenCalledExactlyOnceWith(last);
  fireEvent.keyDown(document.activeElement!, { key: "Home" });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: MOTION_ANIMATION_PRESETS[0]!.name })).toHaveFocus(),
  );
});
