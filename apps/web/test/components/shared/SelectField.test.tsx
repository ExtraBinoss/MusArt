import { useState } from "react";
import { expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SelectField } from "../../../src/components/shared/SelectField";
import { choose } from "../../support/select";
test("explicit selected labels update without a value portal and keep the empty placeholder", () => {
  const props = {
    label: "Current mode",
    value: "one",
    options: [
      { value: "one", label: <span data-rich-choice>One</span> },
      { value: "two", label: "Two" },
    ],
    onValueChange: vi.fn(),
  };
  const view = render(<SelectField {...props} />);
  const trigger = screen.getByRole("combobox", { name: "Current mode" });
  expect(trigger).toHaveTextContent("One");
  expect(trigger.querySelectorAll("[data-rich-choice]")).toHaveLength(1);
  expect(trigger.querySelector('[data-slot="select-value"]')).toHaveStyle({
    pointerEvents: "none",
  });
  view.rerender(<SelectField {...props} value="two" />);
  expect(trigger).toHaveTextContent("Two");
  expect(trigger.querySelector("[data-rich-choice]")).toBeNull();
  view.rerender(<SelectField {...props} value="" />);
  expect(trigger.querySelector('[data-slot="select-value"]')?.textContent).toBe("");
  expect(trigger).toHaveAttribute("data-placeholder");
});
test("the Radix native form value and reset remain independent of the explicit label", async () => {
  function Form() {
    const [value, setValue] = useState("one");
    return (
      <form aria-label="Preferences">
        <SelectField
          label="Form mode"
          value={value}
          options={[
            { value: "one", label: "One" },
            { value: "two", label: "Two" },
          ]}
          onValueChange={setValue}
        />
      </form>
    );
  }
  render(<Form />);
  await choose("Form mode", "Two");
  const form = screen.getByRole("form", { name: "Preferences" });
  expect(screen.getByRole("combobox", { name: "Form mode" })).toHaveTextContent("Two");
  expect(form.querySelector("select")).toHaveValue("two");
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.reset(form);
  expect(screen.getByRole("combobox", { name: "Form mode" })).toHaveTextContent("One");
  expect(form.querySelector("select")).toHaveValue("one");
});
test("closed fields show their label without mounting hidden options; focus preserves native closed typeahead", async () => {
  const change = vi.fn(),
    unselected = vi.fn();
  function OtherLabel() {
    unselected();
    return <>Two</>;
  }
  const view = render(
    <SelectField
      label="Lazy mode"
      value="one"
      options={[
        { value: "one", label: "One" },
        { value: "two", label: <OtherLabel /> },
        { value: "three", label: "Three", disabled: true },
      ]}
      onValueChange={change}
    />,
  );
  const trigger = screen.getByRole("combobox", { name: "Lazy mode" });
  expect(trigger).toHaveTextContent("One");
  expect(unselected).not.toHaveBeenCalled();
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.focus(trigger);
  expect(unselected).toHaveBeenCalled();
  expect(screen.queryByRole("listbox")).toBeNull();
  fireEvent.keyDown(trigger, { key: "t" });
  expect(change).toHaveBeenCalledWith("two");
  view.unmount();
});
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
  expect(screen.queryByRole("listbox")).toBeNull();
  fireEvent.click(two);
  expect(change).not.toHaveBeenCalled();
  view.rerender(<SelectField {...props} />);
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
});
test("changing owner retains the trigger, cancels only the old draft and drops its hidden options", async () => {
  const oldChange = vi.fn(),
    newChange = vi.fn(),
    oldCancel = vi.fn(),
    newCancel = vi.fn();
  const preview = vi.fn(),
    unselected = vi.fn();
  function OtherLabel() {
    unselected();
    return <>Two</>;
  }
  const options = [
    { value: "one", label: "One" },
    { value: "two", label: <OtherLabel /> },
  ];
  const first = {},
    second = {};
  function Field({
    identity,
    change,
    cancel,
  }: {
    identity: object;
    change: (value: string) => void;
    cancel: () => void;
  }) {
    return (
      <>
        <SelectField
          identity={identity}
          label="Owned mode"
          value="one"
          options={options}
          onValueChange={change}
          onPreview={preview}
          onPreviewCancel={cancel}
        />
        <button>Selected layer</button>
      </>
    );
  }
  const view = render(<Field identity={first} change={oldChange} cancel={oldCancel} />);
  const trigger = screen.getByRole("combobox", { name: "Owned mode" });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  const oldOption = await screen.findByRole("option", { name: "Two" });
  fireEvent.pointerMove(oldOption, { pointerType: "mouse" });
  expect(preview).toHaveBeenCalledWith("two");
  unselected.mockClear();
  view.rerender(<Field identity={second} change={newChange} cancel={newCancel} />);
  expect(screen.getByRole("combobox")).toBe(trigger);
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(oldCancel).toHaveBeenCalledOnce();
  expect(newCancel).not.toHaveBeenCalled();
  expect(unselected).not.toHaveBeenCalled();
  const row = screen.getByRole("button", { name: "Selected layer" });
  act(() => row.focus());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(row).toHaveFocus();
  fireEvent.pointerMove(oldOption, { pointerType: "mouse" });
  fireEvent.click(oldOption);
  fireEvent.keyDown(oldOption, { key: "Enter" });
  expect(oldChange).not.toHaveBeenCalled();
  expect(newChange).not.toHaveBeenCalled();
  await choose("Owned mode", "Two");
  expect(newChange).toHaveBeenCalledExactlyOnceWith("two");
  expect(oldChange).not.toHaveBeenCalled();
});
