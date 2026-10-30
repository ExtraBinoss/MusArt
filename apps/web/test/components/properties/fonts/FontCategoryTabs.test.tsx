import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { FontCategoryTabs } from "../../../../src/components/properties/fonts/FontCategoryTabs";
import { i18n } from "../../../../src/state/i18n";

test("exposes one scroll group, actual pressed category and controlled selection", () => {
  void i18n.changeLanguage("fr");
  const change = vi.fn(),
    view = render(<FontCategoryTabs value="all" onChange={change} />);
  expect(screen.getAllByRole("group", { name: "Catégorie de police" })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Toutes" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Serif" }));
  expect(change).toHaveBeenCalledWith("serif");
  view.rerender(<FontCategoryTabs value="serif" onChange={change} />);
  expect(screen.getByRole("button", { name: "Serif" })).toHaveAttribute("aria-pressed", "true");
});
