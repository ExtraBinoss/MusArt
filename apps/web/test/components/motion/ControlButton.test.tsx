import { expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setup } from "../../support/ui";
import { TimelineControlTooltips } from "../../../src/components/motion/control-tooltips";
import { TimelineIconButton } from "../../../src/components/motion/ControlButton";

it("keeps icon-only actions named and exposes real Kbd markup in the tooltip", async () => {
  const d = setup(),
    click = vi.fn(),
    user = userEvent.setup();
  d.mount(
    <TimelineIconButton label="Lire" shortcut={["Espace"]} onClick={click}>
      <span aria-hidden>▶</span>
    </TimelineIconButton>,
  );
  const button = screen.getByRole("button", { name: "Lire" });
  fireEvent.click(button);
  expect(click).toHaveBeenCalledOnce();
  await user.hover(button);
  const tooltip = await screen.findByRole("tooltip");
  expect(tooltip).toHaveTextContent("Lire");
  expect(tooltip.querySelector("kbd")).toHaveTextContent("Espace");
});

it("keeps virtual label controls interactive without constructing Radix tooltip providers", () => {
  const d = setup();
  const click = vi.fn();
  d.mount(
    <TimelineControlTooltips value={false}>
      <TimelineIconButton label="Volume" onClick={click}>
        <span aria-hidden>V</span>
      </TimelineIconButton>
    </TimelineControlTooltips>,
  );
  const button = screen.getByRole("button", { name: "Volume" });
  expect(button).toHaveAttribute("title", "Volume");
  expect(button).not.toHaveAttribute("data-slot", "tooltip-trigger");
  fireEvent.click(button);
  expect(click).toHaveBeenCalledOnce();
});
