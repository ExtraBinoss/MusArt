import { expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setup } from "../../support/ui";
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
