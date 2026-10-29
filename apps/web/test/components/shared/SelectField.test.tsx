import { useState } from "react";
import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  view.rerender(<SelectField {...props} value="one" selectedLabel={<span>Live curve</span>} />);
  expect(trigger).toHaveTextContent("Live curve");
  view.rerender(<SelectField {...props} value="" selectedLabel="Live curve" />);
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
