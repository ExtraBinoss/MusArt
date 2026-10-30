import { expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useParameterWindow } from "../../../../src/components/properties/effects/use-parameter-window";
import { useRef } from "react";
import { MobileControlsContext } from "../../../../src/components/workspace/mobile/use-mobile";

function Fields({ owner = "receipt", count = 40, enabled = true }) {
  const list = useRef<HTMLDivElement>(null);
  const window = useParameterWindow(list, owner, count, enabled);
  return (
    <div className="layer-attachment-viewport" data-testid="viewport">
      <div
        ref={list}
        data-testid="list"
        style={{ height: window.height }}
        onFocusCapture={window.remember}
        onPointerDownCapture={window.remember}
        onKeyDownCapture={window.keyDown}
      >
        {window.indices.map((index) => (
          <div key={index} data-parameter-index={index}>
            <input aria-label={`Field ${index}`} />
            <button>Reset {index}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
test("large lists mount one window, retain the active draft and release native observers/listeners", () => {
  let measure!: () => void;
  const disconnected = vi.fn();
  vi.spyOn(globalThis, "ResizeObserver").mockImplementation(
    class {
      constructor(callback: ResizeObserverCallback) {
        measure = () => callback([], this);
      }
      observe() {}
      unobserve() {}
      disconnect = disconnected;
    },
  );
  const view = render(<Fields />);
  expect(screen.getAllByRole("textbox")).toHaveLength(14);
  const viewport = screen.getByTestId("viewport"),
    list = screen.getByTestId("list");
  Object.defineProperty(viewport, "clientHeight", { value: 420 });
  Object.defineProperty(list, "offsetTop", { value: 100 });
  act(measure);
  expect(screen.getAllByRole("textbox")).toHaveLength(10);
  const input = screen.getByRole("textbox", { name: "Field 0" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "held draft" } });
  viewport.scrollTop = 720;
  fireEvent.scroll(viewport);
  expect(input).toHaveValue("held draft");
  expect(screen.queryByRole("textbox", { name: "Field 1" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "Field 16" })).toBeInTheDocument();
  expect(screen.getAllByRole("textbox")).toHaveLength(15);
  const remove = vi.spyOn(viewport, "removeEventListener");
  view.unmount();
  act(measure);
  expect(disconnected).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
});
test("Tab crosses window boundaries in order, Shift+Tab returns, and rebinding discards old windows", () => {
  const view = render(<Fields />);
  const last = screen.getByRole("button", { name: "Reset 13" });
  act(() => last.focus());
  fireEvent.keyDown(last, { key: "Tab" });
  const next = screen.getByRole("textbox", { name: "Field 14" });
  expect(next).toHaveFocus();
  fireEvent.keyDown(next, { key: "Tab", shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: "ArrowDown" });
  view.rerender(<Fields owner="replacement" />);
  expect(screen.queryByRole("textbox", { name: "Field 14" })).toBeNull();
  view.rerender(<Fields owner="replacement" enabled={false} />);
  expect(screen.getAllByRole("textbox")).toHaveLength(40);
  view.rerender(<Fields count={3} />);
  expect(screen.getAllByRole("textbox")).toHaveLength(3);
});

test("mobile keeps variable-height slider rows in natural flow", () => {
  render(
    <MobileControlsContext value>
      <Fields count={40} />
    </MobileControlsContext>,
  );
  expect(screen.getAllByRole("textbox")).toHaveLength(40);
  const last = screen.getByRole("button", { name: "Reset 39" });
  act(() => last.focus());
  fireEvent.keyDown(last, { key: "Tab" });
  expect(last).toHaveFocus();
  expect(
    screen.getByTestId("list").querySelector('[data-parameter-index="39"]'),
  ).not.toHaveAttribute("style");
});
