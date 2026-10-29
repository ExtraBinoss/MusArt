import { expect, test } from "vitest";
import { screen } from "@testing-library/react";
import { ToolbarScroll } from "../../../../src/components/toolbar/dock/ToolbarScroll";
import { setup } from "../../../support/ui";

test("keeps one genuine scrolling viewport inside the shared ScrollShadow and accessible arrows", () => {
  const d = setup();
  const view = d.mount(
    <ToolbarScroll>
      <button>Tool</button>
    </ToolbarScroll>,
  );
  const viewport = view.container.querySelector(".toolbar-scroll > .toolbar-contents");
  expect(viewport).toContainElement(screen.getByRole("button", { name: "Tool" }));
  expect(
    screen.getByRole("button", { name: "Faire défiler les outils vers le haut" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Faire défiler les outils vers le bas" }),
  ).toBeDisabled();
});
