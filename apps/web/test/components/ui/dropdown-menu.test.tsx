import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { getUiPresentation } from "../../../src/state/session/ui-presentation";
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

test("closed menus own no scheduling lease, while a nested opening extends the bounded presentation priority", () => {
  vi.useFakeTimers();
  const port = getUiPresentation();
  const tree = (open: boolean, nested: boolean) => (
    <Menu.DropdownMenu open={open} modal={false}>
      <Menu.DropdownMenuTrigger>Actions</Menu.DropdownMenuTrigger>
      <Menu.DropdownMenuContent asChild>
        <article data-original-menu>
          <Menu.DropdownMenuSub open={nested}>
            <Menu.DropdownMenuSubTrigger>Effects</Menu.DropdownMenuSubTrigger>
            <Menu.DropdownMenuSubContent asChild>
              <section data-original-submenu>
                <Menu.DropdownMenuItem>Blur</Menu.DropdownMenuItem>
              </section>
            </Menu.DropdownMenuSubContent>
          </Menu.DropdownMenuSub>
        </article>
      </Menu.DropdownMenuContent>
    </Menu.DropdownMenu>
  );
  const view = render(tree(false, false));
  try {
    expect(port.busy()).toBe(false);
    view.rerender(tree(true, false));
    expect(screen.getByRole("menu").tagName).toBe("ARTICLE");
    expect(screen.getByRole("menu")).toHaveAttribute("data-original-menu");
    expect(port.busy()).toBe(true);
    vi.advanceTimersByTime(250);
    expect(port.busy()).toBe(false);
    view.rerender(tree(true, true));
    expect(screen.getByRole("menuitem", { name: "Blur" }).closest("[role=menu]")!.tagName).toBe(
      "SECTION",
    );
    expect(port.busy()).toBe(true);
    view.rerender(tree(true, false));
    expect(port.busy()).toBe(false);
    view.rerender(tree(false, false));
    expect(port.busy()).toBe(false);
    view.unmount();
    expect(port.busy()).toBe(false);
    // Radix posts final focus restoration tasks independently of the presentation timer.
    vi.runOnlyPendingTimers();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});
