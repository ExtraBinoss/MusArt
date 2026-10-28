import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { EffectMenu } from "../../../src/components/layers/EffectMenu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "../../../src/components/ui/dropdown-menu";
import { setup } from "../../support/ui";
test("separates clipped effects and adjustments and chooses a registered effect", async () => {
  const d = setup(),
    add = vi.fn();
  d.mount(
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <EffectMenu onAdd={add} />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  const effects = screen.getByRole("menuitem", { name: "Ajouter un effet" });
  expect(screen.getByRole("menuitem", { name: "Ajouter un réglage" })).toBeVisible();
  fireEvent.keyDown(effects, { key: "ArrowRight" });
  const item = await screen.findByRole("menuitem", { name: "Dither" });
  fireEvent.click(item);
  expect(add).toHaveBeenCalledWith("dither");
});
