import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Kbd, KbdGroup } from "../../../src/components/ui/kbd";
test("exposes compact keyboard key primitives without changing focus order", () => {
  render(
    <KbdGroup data-testid="keys">
      <Kbd>Ctrl</Kbd>
      <Kbd>S</Kbd>
    </KbdGroup>,
  );
  expect(screen.getByText("Ctrl").tagName).toBe("KBD");
  expect(screen.getByTestId("keys").querySelectorAll("kbd")).toHaveLength(2);
});
