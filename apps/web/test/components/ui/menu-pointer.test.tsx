import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import * as Context from "../../../src/components/ui/context-menu";
import * as Dropdown from "../../../src/components/ui/dropdown-menu";
import * as Select from "../../../src/components/ui/select";

function mousePointer(target: HTMLElement, type: string, button = 0) {
  const event = new MouseEvent(type, { bubbles: true, button });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  fireEvent(target, event);
}

test.each(["context", "dropdown"])(
  "editor %s menus leave background pointer styles and accessibility intact",
  (surface) => {
    const context = surface === "context";
    const Root = context ? Context.ContextMenu : Dropdown.DropdownMenu;
    const Trigger = context ? Context.ContextMenuTrigger : Dropdown.DropdownMenuTrigger;
    const Content = context ? Context.ContextMenuContent : Dropdown.DropdownMenuContent;
    const Item = context ? Context.ContextMenuItem : Dropdown.DropdownMenuItem;
    const pointerEvents = document.body.style.pointerEvents,
      overflow = document.body.style.overflow;
    render(
      <>
        <button>Background editor</button>
        <Root>
          <Trigger>Open actions</Trigger>
          <Content>
            <Item>Action</Item>
          </Content>
        </Root>
      </>,
    );
    if (context) fireEvent.contextMenu(screen.getByText("Open actions"));
    else fireEvent.pointerDown(screen.getByText("Open actions"), { button: 0, ctrlKey: false });
    expect(screen.getByRole("menuitem", { name: "Action" })).toBeVisible();
    expect(document.body.style.pointerEvents).toBe(pointerEvents);
    expect(document.body.style.overflow).toBe(overflow);
    expect(
      screen.getByRole("button", { name: "Background editor" }).closest('[aria-hidden="true"]'),
    ).toBeNull();
  },
);

test.each(["context", "context-sub", "dropdown", "dropdown-sub"] as const)(
  "%s ignores secondary-button release over an item and preserves primary drag selection",
  (surface) => {
    const select = vi.fn(),
      capture = vi.fn();
    const context = surface.startsWith("context"),
      nested = surface.endsWith("sub");
    const Root = context ? Context.ContextMenu : Dropdown.DropdownMenu;
    const Trigger = context ? Context.ContextMenuTrigger : Dropdown.DropdownMenuTrigger;
    const Content = context ? Context.ContextMenuContent : Dropdown.DropdownMenuContent;
    const Sub = context ? Context.ContextMenuSub : Dropdown.DropdownMenuSub;
    const SubTrigger = context ? Context.ContextMenuSubTrigger : Dropdown.DropdownMenuSubTrigger;
    const SubContent = context ? Context.ContextMenuSubContent : Dropdown.DropdownMenuSubContent;
    const Item = context ? Context.ContextMenuItem : Dropdown.DropdownMenuItem;
    render(
      <Root modal={false}>
        <Trigger>Open actions</Trigger>
        <Content onPointerUpCapture={capture}>
          {nested ? (
            <Sub open>
              <SubTrigger>Nested</SubTrigger>
              <SubContent>
                <Item onSelect={select}>Activate</Item>
              </SubContent>
            </Sub>
          ) : (
            <Item onSelect={select}>Activate</Item>
          )}
        </Content>
      </Root>,
    );
    if (context) fireEvent.contextMenu(screen.getByText("Open actions"));
    else
      fireEvent.pointerDown(screen.getByText("Open actions"), {
        button: 0,
        pointerType: "mouse",
        ctrlKey: false,
      });
    const item = screen.getByRole("menuitem", { name: "Activate" });
    // Opening on right-down means the newly mounted item never received pointerdown.
    // Radix otherwise synthesizes a left click from this right-button pointerup.
    fireEvent.pointerUp(item, { button: 2, pointerType: "mouse" });
    fireEvent.pointerUp(item, { button: 1, pointerType: "mouse" });
    expect(select).not.toHaveBeenCalled();
    expect(item).toBeVisible();
    expect(capture).toHaveBeenCalledTimes(2);
    fireEvent.pointerUp(item, { button: 0, pointerType: "mouse" });
    expect(select).toHaveBeenCalledOnce();
  },
);

test("select options ignore right/middle release and retain primary mouse selection", () => {
  const changed = vi.fn();
  render(
    <Select.Select defaultOpen defaultValue="one" onValueChange={changed}>
      <Select.SelectTrigger>
        <Select.SelectValue />
      </Select.SelectTrigger>
      <Select.SelectContent>
        <Select.SelectItem value="one">One</Select.SelectItem>
        <Select.SelectItem value="two">Two</Select.SelectItem>
      </Select.SelectContent>
    </Select.Select>,
  );
  const option = screen.getByRole("option", { name: "Two" });
  mousePointer(option, "pointermove");
  mousePointer(option, "pointerup", 2);
  mousePointer(option, "pointerup", 1);
  expect(changed).not.toHaveBeenCalled();
  mousePointer(option, "pointerup");
  expect(changed).toHaveBeenCalledExactlyOnceWith("two");
});
