import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Label } from "../../../src/components/ui/label";
test("associates field labels", () => {
  render(
    <>
      <Label htmlFor="f">Name</Label>
      <input id="f" />
    </>,
  );
  expect(screen.getByLabelText("Name")).toHaveAttribute("id", "f");
});
