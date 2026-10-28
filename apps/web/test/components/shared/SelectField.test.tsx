import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SelectField } from "../../../src/components/shared/SelectField";
import { choose } from "../../support/select";
test("opens a real Radix listbox and reports a chosen option", async () => {
  const change = vi.fn();
  render(
    <SelectField
      label="Mode"
      value="one"
      options={[
        { value: "one", label: "One" },
        { value: "two", label: "Two" },
        { value: "three", label: "Three", disabled: true },
      ]}
      onValueChange={change}
    />,
  );
  await choose("Mode", "Two");
  expect(change).toHaveBeenCalledWith("two");
  expect(screen.getByRole("combobox", { name: "Mode" }).tagName).toBe("BUTTON");
});

test("pointer and keyboard focus preview enabled options once, while close/unmount restore drafts", async () => {
  const change = vi.fn(),
    preview = vi.fn(),
    cancel = vi.fn();
  const props = {
    label: "Mode",
    value: "one",
    options: [
      { value: "one", label: "One" },
      { value: "two", label: "Two" },
      { value: "three", label: "Three", disabled: true },
    ],
    onValueChange: change,
    onPreview: preview,
    onPreviewCancel: cancel,
  };
  const view = render(<SelectField {...props} />);
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.pointerDown(screen.getByRole("combobox"), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  const two = await screen.findByRole("option", { name: "Two" });
  fireEvent.pointerMove(two, { pointerType: "mouse" });
  fireEvent.pointerMove(two, { pointerType: "mouse" });
  expect(preview).toHaveBeenCalledExactlyOnceWith("two");
  expect(change).not.toHaveBeenCalled();
  fireEvent.focus(screen.getByRole("option", { name: "One" }));
  expect(preview).toHaveBeenLastCalledWith("one");
  fireEvent.pointerMove(screen.getByRole("option", { name: "Three" }), { pointerType: "mouse" });
  expect(preview).toHaveBeenCalledTimes(2);
  fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
  expect(cancel).toHaveBeenCalledOnce();
  expect(change).not.toHaveBeenCalled();
  fireEvent.pointerDown(screen.getByRole("combobox"), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  await screen.findByRole("option", { name: "Two" });
  view.unmount();
  expect(cancel).toHaveBeenCalledTimes(2);
});
test("disabling an open field cancels its draft and blocks a late item selection", async () => {
  const change = vi.fn(),
    preview = vi.fn(),
    cancel = vi.fn();
  const props = {
    label: "Mode",
    value: "one",
    options: [
      { value: "one", label: "One" },
      { value: "two", label: "Two" },
    ],
    onValueChange: change,
    onPreview: preview,
    onPreviewCancel: cancel,
  };
  const view = render(<SelectField {...props} />);
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.pointerDown(screen.getByRole("combobox"), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  const two = await screen.findByRole("option", { name: "Two" });
  fireEvent.focus(two);
  expect(preview).toHaveBeenCalledWith("two");
  view.rerender(<SelectField {...props} disabled />);
  expect(cancel).toHaveBeenCalledOnce();
  fireEvent.click(two);
  expect(change).not.toHaveBeenCalled();
});
