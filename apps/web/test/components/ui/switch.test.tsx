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
