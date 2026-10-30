import "../../../../src/state/i18n";
import { expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AudioVolumeContent } from "../../../../src/components/motion/audio/AudioVolumeContent";
import { Popover } from "../../../../src/components/ui/popover";
import { TooltipProvider } from "../../../../src/components/ui/tooltip";
import { audioFixture } from "../../../support/audio";
it("uses the shared glass slider with explicit 0–100% and commits number edits only on completion", () => {
  const d = audioFixture(),
    before = d.engine.getSnapshot();
  render(
    <TooltipProvider>
      <Popover open>
        <AudioVolumeContent engine={d.engine} track={d.track()} />
      </Popover>
    </TooltipProvider>,
  );
  const slider = screen.getByRole("slider", { name: "Volume" });
  expect(slider.getAttribute("aria-valuemax")).toBe("100");
  const input = screen.getByRole("spinbutton", { name: /Volume en pourcentage|Volume in percent/ });
  expect(input.getAttribute("max")).toBe("100");
  fireEvent.change(input, { target: { value: "25" } });
  expect(d.engine.getSnapshot()).toBe(before);
  expect(slider.getAttribute("aria-valuenow")).toBe("25");
  fireEvent.blur(input);
  expect(d.track().volume).toBe(0.25);
  d.engine.undo();
  expect(d.track().volume).toBe(1);
});

it("rejects a retained mute callback after a same-ID document reload", () => {
  const d = audioFixture();
  render(
    <TooltipProvider>
      <Popover open>
        <AudioVolumeContent engine={d.engine} track={d.track()} />
      </Popover>
    </TooltipProvider>,
  );
  const button = screen.getByRole("button", { name: /Couper|Mute/ });
  d.engine.load(structuredClone(d.engine.getSnapshot().project));
  const before = d.engine.getSnapshot();
  fireEvent.click(button);
  expect(d.engine.getSnapshot()).toBe(before);
});
