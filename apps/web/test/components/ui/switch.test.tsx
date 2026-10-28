import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Switch } from "../../../src/components/ui/switch";
test("toggles accessible state", () => {
  const change = vi.fn();
  render(
    <>
      <Switch aria-label="Enabled" onCheckedChange={change} />
      <Switch aria-label="Small" size="sm" defaultChecked />
    </>,
  );
  fireEvent.click(screen.getByRole("switch", { name: "Enabled" }));
  expect(change).toHaveBeenCalledWith(true);
  expect(screen.getByRole("switch", { name: "Small" })).toHaveAttribute("aria-checked", "true");
});
test("preserves genuine Radix thumb states and disabled native keyboard semantics", () => {
  const change = vi.fn();
  const view = render(<Switch aria-label="Active" defaultChecked onCheckedChange={change} />);
  const control = screen.getByRole("switch", { name: "Active" });
  expect(control.querySelector('[data-slot="switch-thumb"]')).toHaveAttribute(
    "data-state",
    "checked",
  );
  fireEvent.click(control);
  expect(control).toHaveAttribute("aria-checked", "false");
  expect(control.querySelector('[data-slot="switch-thumb"]')).toHaveAttribute(
    "data-state",
    "unchecked",
  );
  view.rerender(<Switch aria-label="Active" disabled onCheckedChange={change} />);
  fireEvent.click(control);
  expect(change).toHaveBeenCalledOnce();
  expect(control).toBeDisabled();
});
