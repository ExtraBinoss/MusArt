import "../../../src/state/i18n";
import { useState, Profiler } from "react";
import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NumberInput } from "../../../src/components/shared/NumberInput";
test("commits valid numbers once, clamps ranges and preserves invalid drafts until blur", () => {
  const onCommit = vi.fn();
  function Host() {
    const [value, setValue] = useState(10);
    return (
      <NumberInput
        key={value}
        label="Width"
        value={value}
        min={1}
        max={100}
        unit="px"
        onCommit={(next) => {
          onCommit(next);
          setValue(next);
        }}
      />
    );
  }
  render(<Host />);
  const input = () => screen.getByLabelText("Width");
  fireEvent.change(input(), { target: { value: "-" } });
  fireEvent.blur(input());
  expect(input()).toHaveValue("10");
  fireEvent.change(input(), { target: { value: "" } });
  fireEvent.blur(input());
  expect(input()).toHaveValue("10");
  fireEvent.change(input(), { target: { value: "150" } });
  expect(onCommit).not.toHaveBeenCalled();
  fireEvent.blur(input());
  expect(onCommit).toHaveBeenLastCalledWith(100);
  fireEvent.change(input(), { target: { value: "100" } });
  fireEvent.blur(input());
  expect(onCommit).toHaveBeenCalledOnce();
  fireEvent.change(input(), { target: { value: "25" } });
  fireEvent.keyDown(input(), { key: "Enter" });
  expect(onCommit).toHaveBeenCalledTimes(2);
  fireEvent.change(input(), { target: { value: "90" } });
  fireEvent.keyDown(input(), { key: "Escape" });
  fireEvent.blur(input());
  expect(input()).toHaveValue("25");
  expect(onCommit).toHaveBeenCalledTimes(2);
});
test("previews held step nudges, then commits only on key release", () => {
  const commit = vi.fn();
  const preview = vi.fn();
  render(<NumberInput label="X" value={2} onCommit={commit} onPreview={preview} />);
  const input = screen.getByLabelText("X");
  fireEvent.keyDown(input, { key: "ArrowUp" });
  expect(preview).toHaveBeenCalledWith(3);
  expect(commit).not.toHaveBeenCalled();
  fireEvent.keyUp(input, { key: "ArrowUp" });
  expect(commit).toHaveBeenLastCalledWith(3);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyUp(input, { key: "ArrowDown" });
  expect(commit).toHaveBeenLastCalledWith(2);
});
test("edits native drafts without React commits and cancels invalid previews", () => {
  const commits = vi.fn();
  const preview = vi.fn();
  const cancel = vi.fn();
  render(
    <Profiler id="numeric" onRender={commits}>
      <NumberInput
        label="Width"
        value={20}
        onPreview={preview}
        onCommit={vi.fn()}
        onCancel={cancel}
      />
    </Profiler>,
  );
  const baseline = commits.mock.calls.length;
  for (const value of ["25", "26", "27"])
    fireEvent.change(screen.getByLabelText("Width"), { target: { value } });
  expect(commits).toHaveBeenCalledTimes(baseline);
  expect(preview).toHaveBeenLastCalledWith(27);
  fireEvent.change(screen.getByLabelText("Width"), { target: { value: "-" } });
  fireEvent.blur(screen.getByLabelText("Width"));
  expect(cancel).toHaveBeenCalledOnce();
});

test("scrubs with threshold, snapping and one commit; cancel restores canonical input", () => {
  const preview = vi.fn(),
    commit = vi.fn(),
    cancel = vi.fn();
  render(
    <NumberInput
      label="Angle"
      value={10}
      min={0}
      max={50}
      step={1}
      snapPoints={[20]}
      snapThreshold={2}
      onPreview={preview}
      onCommit={commit}
      onCancel={cancel}
    />,
  );
  const handle = screen.getByRole("button", { name: "Ajuster Angle" });
  fireEvent.pointerMove(handle, { clientX: 80 });
  fireEvent.pointerDown(handle, { clientX: 10, button: 2, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 80, pointerId: 1 });
  expect(preview).not.toHaveBeenCalled();
  fireEvent.pointerDown(handle, { clientX: 10, button: 0, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 11, pointerId: 1 });
  expect(preview).not.toHaveBeenCalled();
  fireEvent.pointerMove(handle, { clientX: 55, pointerId: 1 });
  expect(preview).toHaveBeenLastCalledWith(20);
  expect(commit).not.toHaveBeenCalled();
  fireEvent.pointerUp(handle, { clientX: 55, pointerId: 1 });
  expect(commit).toHaveBeenCalledExactlyOnceWith(20);
  fireEvent.lostPointerCapture(handle, { pointerId: 1 });
  expect(cancel).not.toHaveBeenCalled();
  fireEvent.pointerDown(handle, { clientX: 10, button: 0, pointerId: 2 });
  fireEvent.pointerMove(handle, { clientX: 100, shiftKey: true, pointerId: 2 });
  expect(preview).toHaveBeenLastCalledWith(50);
  fireEvent.pointerCancel(handle, { pointerId: 2 });
  expect(cancel).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Angle")).toHaveValue("20");
  fireEvent.pointerDown(handle, { clientX: 10, button: 0, pointerId: 3 });
  fireEvent.pointerUp(handle, { clientX: 10, pointerId: 3 });
  expect(screen.getByLabelText("Angle")).toHaveFocus();
});
test("clamps shift keyboard steps and cancels lost pointer capture", () => {
  const cancel = vi.fn();
  render(<NumberInput label="Y" value={1} min={0} max={5} onCommit={vi.fn()} onCancel={cancel} />);
  fireEvent.keyDown(screen.getByLabelText("Y"), { key: "ArrowUp", shiftKey: true });
  expect(screen.getByLabelText("Y")).toHaveValue("5");
  const handle = screen.getByRole("button", { name: "Ajuster Y" });
  fireEvent.pointerDown(handle, { clientX: 0, button: 0, pointerId: 3 });
  fireEvent.pointerMove(handle, { clientX: -100, pointerId: 3 });
  fireEvent.lostPointerCapture(handle, { pointerId: 3 });
  expect(screen.getByLabelText("Y")).toHaveValue("1");
  expect(cancel).toHaveBeenCalledOnce();
});

test("tracks canonical prop changes from undo without a remount and scrubs without React commits", () => {
  const commits = vi.fn(),
    preview = vi.fn(),
    change = vi.fn();
  function Field({ value }: { value: number }) {
    return (
      <Profiler id="field" onRender={commits}>
        <NumberInput label="Scale" value={value} onCommit={change} onPreview={preview} />
      </Profiler>
    );
  }
  const view = render(<Field value={10} />);
  view.rerender(<Field value={30} />);
  expect(screen.getByLabelText("Scale")).toHaveValue("30");
  const before = commits.mock.calls.length,
    handle = screen.getByRole("button", { name: "Ajuster Scale" });
  const released = vi.spyOn(handle, "releasePointerCapture");
  vi.spyOn(handle, "hasPointerCapture").mockReturnValue(true);
  fireEvent.pointerDown(handle, { button: 0, clientX: 0, pointerId: 1 });
  for (const clientX of [20, 30, 40]) fireEvent.pointerMove(handle, { clientX, pointerId: 1 });
  expect(preview).toHaveBeenLastCalledWith(38);
  expect(commits).toHaveBeenCalledTimes(before);
  expect(change).not.toHaveBeenCalled();
  fireEvent.pointerUp(handle, { pointerId: 1 });
  expect(change).toHaveBeenCalledExactlyOnceWith(38);
  expect(released).toHaveBeenCalled();
});

test("formats at most two decimals without rounding untouched document values", () => {
  const commit = vi.fn();
  render(<NumberInput label="Precise" value={1.23456789} decimalScale={5} onCommit={commit} />);
  const input = screen.getByLabelText("Precise");
  expect(input).toHaveValue("1.23");
  fireEvent.focus(input);
  fireEvent.blur(input);
  expect(commit).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "2.34999" } });
  fireEvent.blur(input);
  expect(commit).toHaveBeenCalledExactlyOnceWith(2.35);
});
test("mixed fields remain blank when untouched and commit an explicit numeric draft", () => {
  const commit = vi.fn();
  render(<NumberInput label="Mixed" value={40} mixed onCommit={commit} />);
  const input = screen.getByLabelText("Mixed");
  expect(input).toHaveValue("");
  fireEvent.blur(input);
  expect(commit).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "60" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(commit).toHaveBeenCalledExactlyOnceWith(60);
});

test("immutable target rebinding reuses the input and cancels old pointer/key/typing drafts", () => {
  const preview = vi.fn(),
    commit = vi.fn(),
    cancel = vi.fn(),
    a = {},
    b = {},
    props = { label: "Stable", onPreview: preview, onCommit: commit, onCancel: cancel };
  const view = render(<NumberInput identity={a} value={10} {...props} />),
    input = screen.getByLabelText("Stable"),
    handle = screen.getByRole("button", { name: "Ajuster Stable" });
  fireEvent.pointerDown(handle, { button: 0, clientX: 0, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: 20, pointerId: 1 });
  expect(preview).toHaveBeenCalled();
  view.rerender(<NumberInput identity={b} value={30} {...props} />);
  expect(screen.getByLabelText("Stable")).toBe(input);
  expect(input).toHaveValue("30");
  const calls = preview.mock.calls.length;
  fireEvent.pointerMove(handle, { clientX: 50, pointerId: 1 });
  fireEvent.pointerUp(handle, { pointerId: 1 });
  expect(preview).toHaveBeenCalledTimes(calls);
  expect(commit).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "ArrowUp" });
  view.rerender(<NumberInput identity={a} value={10} {...props} />);
  const priorRepeat = preview.mock.calls.length;
  fireEvent.keyDown(input, { key: "ArrowUp", repeat: true });
  expect(preview).toHaveBeenCalledTimes(priorRepeat);
  fireEvent.keyUp(input, { key: "ArrowUp" });
  expect(commit).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "50" } });
  view.rerender(<NumberInput identity={b} value={30} {...props} />);
  fireEvent.blur(input);
  expect(commit).not.toHaveBeenCalled();
  expect(cancel).toHaveBeenCalled();
});
