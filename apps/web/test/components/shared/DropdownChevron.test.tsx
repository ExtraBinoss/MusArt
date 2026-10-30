import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { DropdownChevron } from "../../../src/components/shared/DropdownChevron";

test("keeps the shared disclosure decorative while its trigger owns the accessible state", () => {
  const view = render(
    <button aria-expanded data-state="open">
      Fonts
      <DropdownChevron size={13} />
    </button>,
  );
  expect(screen.getByRole("button", { name: "Fonts" })).toHaveAttribute("aria-expanded", "true");
  expect(view.container.querySelector('[data-slot="select-chevron"]')).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  expect(view.container.querySelector("svg")).toHaveClass("dropdown-chevron");
});
