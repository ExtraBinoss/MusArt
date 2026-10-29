import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { InspectorInteractionBoundary } from "../../../src/components/workspace/InspectorInteractionBoundary";

test("pending controls reject input handlers without inherited disabled or inert attributes", () => {
  const pointerDown = vi.fn(),
    pointerUp = vi.fn(),
    click = vi.fn(),
    keyDown = vi.fn(),
    keyUp = vi.fn(),
    change = vi.fn(),
    contextMenu = vi.fn(),
    beforeInput = vi.fn();
  function Content({ busy }: { busy: boolean }) {
    return (
      <InspectorInteractionBoundary busy={busy}>
        <input
          aria-label="Property"
          onPointerDown={pointerDown}
          onPointerUp={pointerUp}
          onClick={click}
          onKeyDown={keyDown}
          onKeyUp={keyUp}
          onChange={change}
          onBeforeInput={beforeInput}
          onContextMenu={contextMenu}
        />
      </InspectorInteractionBoundary>
    );
  }
  const view = render(<Content busy />);
  const input = screen.getByRole("textbox", { name: "Property" });
  const boundary = input.parentElement!;
  expect(boundary).toHaveAttribute("aria-busy", "true");
  for (const attribute of ["inert", "disabled", "aria-disabled"])
    expect(boundary).not.toHaveAttribute(attribute);
  expect(input).not.toBeDisabled();
  function interact(value: string) {
    fireEvent.pointerDown(input);
    fireEvent.pointerUp(input);
    fireEvent.click(input);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyUp(input, { key: "Enter" });
    fireEvent.keyPress(input, { key: "a", charCode: 97, which: 97 });
    fireEvent.change(input, { target: { value } });
    fireEvent.contextMenu(input);
  }
  interact("stale");
  const handlers = [
    pointerDown,
    pointerUp,
    click,
    keyDown,
    keyUp,
    change,
    contextMenu,
    beforeInput,
  ];
  for (const handler of handlers) expect(handler).not.toHaveBeenCalled();
  view.rerender(<Content busy={false} />);
  expect(screen.getByRole("textbox", { name: "Property" })).toBe(input);
  expect(boundary).toHaveAttribute("aria-busy", "false");
  interact("current");
  for (const handler of handlers) expect(handler).toHaveBeenCalledOnce();
});

test("pending focus is rejected and blur cannot commit an old property", () => {
  const focus = vi.fn(),
    blur = vi.fn();
  function Content({ busy }: { busy: boolean }) {
    return (
      <InspectorInteractionBoundary busy={busy}>
        <input aria-label="Property" onFocus={focus} onBlur={blur} />
      </InspectorInteractionBoundary>
    );
  }
  const view = render(<Content busy />);
  const input = screen.getByRole("textbox", { name: "Property" });
  act(() => input.focus());
  expect(input).not.toHaveFocus();
  expect(focus).not.toHaveBeenCalled();
  expect(blur).not.toHaveBeenCalled();
  view.rerender(<Content busy={false} />);
  act(() => input.focus());
  expect(input).toHaveFocus();
  expect(focus).toHaveBeenCalledOnce();
  view.rerender(<Content busy />);
  act(() => input.blur());
  expect(blur).not.toHaveBeenCalled();
  view.rerender(<Content busy={false} />);
  act(() => {
    input.focus();
    input.blur();
  });
  expect(blur).toHaveBeenCalledOnce();
});
