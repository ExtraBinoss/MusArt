import { expect, test, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

test("an explicit container preserves nonmodal Radix presence, Escape and native focus cleanup", async () => {
  const container = document.createElement("aside");
  document.body.append(container);
  const select = vi.fn(),
    pointerEvents = document.body.style.pointerEvents,
    view = render(
      <Menu.ContextMenu modal={false}>
        <Menu.ContextMenuTrigger asChild>
          <button>Context owner</button>
        </Menu.ContextMenuTrigger>
        <Menu.ContextMenuContent portalContainer={container}>
          <Menu.ContextMenuItem onSelect={select}>Duplicate</Menu.ContextMenuItem>
        </Menu.ContextMenuContent>
      </Menu.ContextMenu>,
    );
  try {
    expect(container).toBeEmptyDOMElement();
    const trigger = screen.getByRole("button", { name: "Context owner" });
    trigger.focus();
    fireEvent.contextMenu(trigger, { button: 2, clientX: 20, clientY: 30 });
    const content = await screen.findByRole("menu");
    expect(container.contains(content)).toBe(true);
    expect(view.container.contains(content)).toBe(false);
    expect(content).toHaveAttribute("data-slot", "context-menu-content");
    expect(content).toHaveAttribute("data-state", "open");
    expect(content.closest("[data-radix-popper-content-wrapper]")).not.toBeNull();
    expect(document.body.style.pointerEvents).toBe(pointerEvents);
    fireEvent.keyDown(content, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(container).toBeEmptyDOMElement();
    expect(document.body.style.pointerEvents).toBe(pointerEvents);
    expect(select).not.toHaveBeenCalled();
    trigger.blur();
    trigger.focus();
    expect(trigger).toHaveFocus();
  } finally {
    view.unmount();
    container.remove();
  }
});
