import { expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import { setup } from "../../../support/ui";
import { HorizontalScroll } from "../../../../src/components/shared/scroll/HorizontalScroll";

test("uses the existing horizontal ScrollShadow around a named native viewport", () => {
  const d = setup(),
    view = d.mount(
      <HorizontalScroll label="Catégories" className="filters" viewportClassName="viewport">
        <button>Sans</button>
      </HorizontalScroll>,
    );
  const viewport = screen.getByRole("group", { name: "Catégories" });
  expect(viewport).toHaveClass("horizontal-scroll-viewport", "viewport");
  expect(viewport).toHaveAttribute("tabindex", "0");
  expect(viewport.parentElement).toHaveClass("scroll-shadow");
  expect(viewport.parentElement).toHaveAttribute("data-scroll-axis", "horizontal");
  expect(viewport).toContainElement(screen.getByRole("button", { name: "Sans" }));
  expect(
    screen.getByRole("button", { name: "Faire défiler Catégories vers la gauche" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Faire défiler Catégories vers la droite" }),
  ).toBeDisabled();
  const remove = vi.spyOn(viewport, "removeEventListener");
  view.unmount();
  expect(remove).toHaveBeenCalledWith("wheel", expect.any(Function));
  expect(remove).toHaveBeenCalledWith("click", expect.any(Function), true);
});
