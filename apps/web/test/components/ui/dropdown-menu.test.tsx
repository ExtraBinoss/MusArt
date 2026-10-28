import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import * as Menu from "../../../src/components/ui/dropdown-menu";
test("renders genuine menu, checkbox, radio, groups and nested actions", async () => {
  const select = vi.fn();
  render(
    <Menu.DropdownMenu defaultOpen modal={false}>
      <Menu.DropdownMenuTrigger>Actions</Menu.DropdownMenuTrigger>
      <Menu.DropdownMenuPortal>
        <span data-testid="portal">Portal</span>
      </Menu.DropdownMenuPortal>
      <Menu.DropdownMenuContent>
        <Menu.DropdownMenuLabel inset>Layers</Menu.DropdownMenuLabel>
        <Menu.DropdownMenuGroup>
          <Menu.DropdownMenuItem inset variant="destructive" onSelect={select}>
            Delete<Menu.DropdownMenuShortcut>Del</Menu.DropdownMenuShortcut>
          </Menu.DropdownMenuItem>
        </Menu.DropdownMenuGroup>
        <Menu.DropdownMenuSeparator />
        <Menu.DropdownMenuCheckboxItem checked>Visible</Menu.DropdownMenuCheckboxItem>
        <Menu.DropdownMenuRadioGroup value="normal">
          <Menu.DropdownMenuRadioItem value="normal">Normal</Menu.DropdownMenuRadioItem>
        </Menu.DropdownMenuRadioGroup>
        <Menu.DropdownMenuSub>
          <Menu.DropdownMenuSubTrigger inset>Effects</Menu.DropdownMenuSubTrigger>
          <Menu.DropdownMenuSubContent>
            <Menu.DropdownMenuItem>Dither</Menu.DropdownMenuItem>
          </Menu.DropdownMenuSubContent>
        </Menu.DropdownMenuSub>
      </Menu.DropdownMenuContent>
    </Menu.DropdownMenu>,
  );
  expect(screen.getByRole("menuitemcheckbox")).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("menuitemradio")).toHaveAttribute("aria-checked", "true");
  fireEvent.keyDown(screen.getByRole("menuitem", { name: "Effects" }), { key: "ArrowRight" });
  expect(await screen.findByText("Dither")).toBeVisible();
  expect(screen.getByTestId("portal")).toBeVisible();
  fireEvent.click(screen.getByRole("menuitem", { name: "DeleteDel", hidden: true }));
  expect(select).toHaveBeenCalledOnce();
});
