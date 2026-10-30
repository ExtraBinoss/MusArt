import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { MobileNumberInput } from "../../../../src/components/workspace/mobile/MobileNumberInput";
import { MobileControlsContext } from "../../../../src/components/workspace/mobile/use-mobile";
import { NumberInput } from "../../../../src/components/shared/NumberInput";
import { setup } from "../../../support/ui";

test("mobile sliders preview held keys without rendering their host and commit once on release", () => {
  const d = setup(),
    commit = vi.fn(),
    preview = vi.fn(),
    renders = vi.fn();
  function Host() {
    renders();
    return (
      <MobileControlsContext value>
        <NumberInput
          label="Opacity"
          value={50}
          min={0}
          max={100}
          onPreview={preview}
          onCommit={commit}
        />
      </MobileControlsContext>
    );
  }
  d.mount(<Host />);
  const slider = screen.getByRole("slider", { name: "Régler Opacity" });
  const before = renders.mock.calls.length;
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  fireEvent.keyDown(slider, { key: "ArrowRight", repeat: true });
  expect(preview).toHaveBeenLastCalledWith(52);
  expect(commit).not.toHaveBeenCalled();
  expect(document.querySelector("[data-mobile-adjusting]")).not.toBeNull();
  fireEvent.keyUp(slider, { key: "ArrowRight" });
  expect(commit).toHaveBeenCalledExactlyOnceWith(52);
  expect(document.querySelector("[data-mobile-adjusting]")).toBeNull();
  expect(renders).toHaveBeenCalledTimes(before);
});

test("precision editing clamps, cancels invalid input and cleans up an interrupted preview", () => {
  const d = setup(),
    commit = vi.fn(),
    cancel = vi.fn();
  const view = d.mount(
    <MobileNumberInput
      label="X"
      value={10}
      min={0}
      max={100}
      onCommit={commit}
      onCancel={cancel}
    />,
  );
  const input = screen.getByLabelText("X");
  fireEvent.change(input, { target: { value: "150" } });
  fireEvent.blur(input);
  expect(commit).toHaveBeenCalledExactlyOnceWith(100);
  fireEvent.change(input, { target: { value: "-" } });
  fireEvent.blur(input);
  expect(input).toHaveValue("100");
  fireEvent.change(input, { target: { value: "24" } });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(input).toHaveValue("100");
  fireEvent.change(input, { target: { value: "30" } });
  const before = cancel.mock.calls.length;
  view.unmount();
  expect(cancel).toHaveBeenCalledTimes(before + 1);
  expect(commit).toHaveBeenCalledTimes(1);
});

test("slider Escape and pointer cancellation restore the original value with no commit", () => {
  const d = setup(),
    commit = vi.fn(),
    cancel = vi.fn();
  d.mount(
    <MobileNumberInput
      label="X"
      value={10}
      min={0}
      max={100}
      onCommit={commit}
      onCancel={cancel}
    />,
  );
  const slider = screen.getByRole("slider");
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  fireEvent.keyDown(slider, { key: "Escape" });
  fireEvent.keyUp(slider, { key: "ArrowRight" });
  expect(commit).not.toHaveBeenCalled();
  expect(screen.getByLabelText("X")).toHaveValue("10");
  fireEvent.pointerDown(slider, { button: 0 });
  fireEvent.pointerCancel(slider);
  expect(commit).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalledTimes(2);
});

test("external animation presentation cancels a stale draft and unsubscribes", () => {
  const d = setup(),
    listeners = new Set<() => void>(),
    cancel = vi.fn();
  let value: number | null = 20;
  const presentation = {
    read: () => value,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  const view = d.mount(
    <MobileNumberInput
      label="X"
      value={20}
      onCommit={vi.fn()}
      onCancel={cancel}
      presentation={presentation}
    />,
  );
  fireEvent.change(screen.getByLabelText("X"), { target: { value: "30" } });
  act(() => {
    value = 45;
    for (const fn of listeners) fn();
  });
  expect(screen.getByLabelText("X")).toHaveValue("45");
  expect(cancel).toHaveBeenCalledOnce();
  act(() => {
    value = null;
    for (const fn of listeners) fn();
  });
  expect(screen.getByLabelText("X")).toHaveValue("");
  view.unmount();
  expect(listeners.size).toBe(0);
});

test("rebinding a held slider key cancels the old owner and blocks repeated input until release", () => {
  const d = setup(),
    oldCommit = vi.fn(),
    newCommit = vi.fn(),
    cancel = vi.fn();
  const view = d.mount(
    <MobileNumberInput
      label="X"
      value={10}
      identity="first"
      onCommit={oldCommit}
      onCancel={cancel}
    />,
  );
  const slider = screen.getByRole("slider");
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  view.rerender(
    <MobileNumberInput
      label="X"
      value={100}
      identity="second"
      onCommit={newCommit}
      onCancel={cancel}
    />,
  );
  expect(cancel).toHaveBeenCalledOnce();
  fireEvent.keyDown(slider, { key: "ArrowRight", repeat: true });
  fireEvent.keyUp(slider, { key: "ArrowRight" });
  expect(oldCommit).not.toHaveBeenCalled();
  expect(newCommit).not.toHaveBeenCalled();
  expect(screen.getByLabelText("X")).toHaveValue("100");
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  fireEvent.keyUp(slider, { key: "ArrowRight" });
  expect(newCommit).toHaveBeenCalledExactlyOnceWith(101);
});

test("cancelling mixed values restores the mixed display and disabled sliders do not start", () => {
  const d = setup(),
    commit = vi.fn(),
    start = vi.fn();
  const view = d.mount(
    <MobileNumberInput label="X" value={10} mixed onStart={start} onCommit={commit} />,
  );
  const slider = screen.getByRole("slider");
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  fireEvent.keyDown(slider, { key: "Escape" });
  expect(screen.getByLabelText("X")).toHaveValue("");
  view.rerender(
    <MobileNumberInput label="X" value={10} disabled onStart={start} onCommit={commit} />,
  );
  start.mockClear();
  fireEvent.pointerDown(slider, { button: 0 });
  fireEvent.keyDown(slider, { key: "ArrowRight" });
  expect(start).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  expect(document.querySelector("[data-mobile-adjusting]")).toBeNull();
});

test("double-tapping the property name resets once through the same command boundary", () => {
  const d = setup(),
    commit = vi.fn();
  d.mount(<MobileNumberInput label="X" value={10} resetValue={25} onCommit={commit} />);
  fireEvent.doubleClick(screen.getByRole("button", { name: "X" }));
  expect(commit).toHaveBeenCalledExactlyOnceWith(25);
  expect(screen.getByLabelText("X")).toHaveValue("25");
});
