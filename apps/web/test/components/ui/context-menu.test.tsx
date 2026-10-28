import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as Menu from "../../../src/components/ui/context-menu";
test("genuine context menus expose nested, checkbox, radio and grouped actions", async () => {
  const select = vi.fn();
  render(
    <Menu.ContextMenu modal={false}>
      <Menu.ContextMenuTrigger>Layers</Menu.ContextMenuTrigger>
      <Menu.ContextMenuPortal>
        <span data-testid="portal">Portal</span>
      </Menu.ContextMenuPortal>
      <Menu.ContextMenuContent>
        <Menu.ContextMenuLabel inset>Actions</Menu.ContextMenuLabel>
        <Menu.ContextMenuGroup>
          <Menu.ContextMenuItem inset variant="destructive" onSelect={select}>
            Delete<Menu.ContextMenuShortcut>Del</Menu.ContextMenuShortcut>
          </Menu.ContextMenuItem>
        </Menu.ContextMenuGroup>
        <Menu.ContextMenuSeparator />
        <Menu.ContextMenuCheckboxItem checked>Visible</Menu.ContextMenuCheckboxItem>
        <Menu.ContextMenuRadioGroup value="normal">
          <Menu.ContextMenuRadioItem value="normal">Normal</Menu.ContextMenuRadioItem>
        </Menu.ContextMenuRadioGroup>
        <Menu.ContextMenuSub>
          <Menu.ContextMenuSubTrigger inset>Effects</Menu.ContextMenuSubTrigger>
          <Menu.ContextMenuSubContent>
            <Menu.ContextMenuItem>Dither</Menu.ContextMenuItem>
          </Menu.ContextMenuSubContent>
        </Menu.ContextMenuSub>
      </Menu.ContextMenuContent>
    </Menu.ContextMenu>,
  );
  fireEvent.contextMenu(screen.getByText("Layers"));
  expect(screen.getByRole("menuitemcheckbox")).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("menuitemradio")).toHaveAttribute("aria-checked", "true");
  fireEvent.keyDown(screen.getByRole("menuitem", { name: "Effects" }), { key: "ArrowRight" });
  expect(await screen.findByText("Dither")).toBeVisible();
  expect(screen.getByTestId("portal")).toBeVisible();
  fireEvent.click(screen.getByRole("menuitem", { name: "DeleteDel", hidden: true }));
  expect(select).toHaveBeenCalledOnce();
});
