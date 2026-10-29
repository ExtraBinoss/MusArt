import { expect, test, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { IconButton } from "../../../src/components/shared/IconButton";
import { setup } from "../../support/ui";
test("provides accessible action, active state and tooltip", () => {
  const { mount } = setup();
  const click = vi.fn();
  mount(
    <>
      <IconButton label="Save" onClick={click}>
        <span>+</span>
      </IconButton>
      <IconButton label="Select" active>
        <span>v</span>
      </IconButton>
    </>,
  );
  fireEvent.click(screen.getByLabelText("Save"));
  expect(click).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Select")).toHaveAttribute("aria-pressed", "true");
});
test("shows an assigned plus key without empty or duplicate keycaps", async () => {
  const { mount } = setup();
  mount(
    <IconButton label="Zoom" shortcut="Ctrl++">
      <span>Zoom</span>
    </IconButton>,
  );
  fireEvent.pointerMove(screen.getByLabelText("Zoom"), { pointerType: "mouse" });
  const tooltip = await screen.findByRole("tooltip");
  expect(
    [...tooltip.querySelectorAll('[data-slot="kbd"]')].map((node) => node.textContent),
  ).toEqual(["Ctrl", "+"]);
});

test("allows viewport actions to place tooltips below their stable button geometry", async () => {
  const { mount } = setup();
  mount(
    <IconButton label="Zoom out" tooltipSide="bottom">
      <span>−</span>
    </IconButton>,
  );
  fireEvent.pointerMove(screen.getByLabelText("Zoom out"), { pointerType: "mouse" });
  await screen.findByRole("tooltip");
  expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveAttribute(
    "data-side",
    "bottom",
  );
});
