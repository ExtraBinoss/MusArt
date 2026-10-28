import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "../../../src/components/ui/input";
test("forwards input props and accessible name", () => {
  render(<Input aria-label="Name" type="text" defaultValue="Artwork" />);
  expect(screen.getByRole("textbox")).toHaveValue("Artwork");
});
