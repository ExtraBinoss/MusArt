import { expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { EffectColor } from "../../../../src/components/properties/effects/EffectColor";
import { setup } from "../../../support/ui";
test("compact effect swatches open the real RGB picker, preview and commit once, and cancel on close", async () => {
  const d = setup(),
    onStart = vi.fn(),
    onPreview = vi.fn(),
    onCommit = vi.fn(),
    onCancel = vi.fn();
  d.mount(
    <EffectColor
      label="Palette"
      value="#112233"
      disabled={false}
      {...{ onStart, onPreview, onCommit, onCancel }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Palette" }));
  const input = await screen.findByLabelText("Couleur hexadécimale");
  expect(screen.queryByRole("slider", { name: "Alpha" })).toBeNull();
  fireEvent.change(input, { target: { value: "#abcdef" } });
  expect(onPreview).toHaveBeenCalledWith("#abcdef");
  expect(onCommit).not.toHaveBeenCalled();
  fireEvent.pointerUp(input);
  expect(onCommit).toHaveBeenCalledExactlyOnceWith("#abcdef");
  expect(onStart).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Palette" }));
  expect(onCancel).toHaveBeenCalled();
});
test.each([
  ["First", "Second"],
  ["Second", "First"],
])("controlled palette handoff %s to %s cancels before the new preview", async (first, second) => {
  const d = setup(),
    callbacks = {
      First: { onStart: vi.fn(), onPreview: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn() },
      Second: { onStart: vi.fn(), onPreview: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn() },
    };
  function Palette() {
    const [open, setOpen] = useState<string | null>(null);
    return ["First", "Second"].map((label) => (
      <EffectColor
        key={label}
        label={label}
        identity={label}
        value="#112233"
        disabled={false}
        open={open === label}
        onOpenChange={(next) =>
          setOpen((current) => (next ? label : current === label ? null : current))
        }
        {...callbacks[label as keyof typeof callbacks]}
      />
    ));
  }
  d.mount(<Palette />);
  fireEvent.click(screen.getByRole("button", { name: first }));
  fireEvent.change(await screen.findByLabelText("Couleur hexadécimale"), {
    target: { value: "#abcdef" },
  });
  const old = callbacks[first as keyof typeof callbacks];
  expect(old.onPreview).toHaveBeenCalledExactlyOnceWith("#abcdef");
  fireEvent.click(screen.getByRole("button", { name: second }));
  await waitFor(() => expect(screen.getAllByLabelText("Couleur hexadécimale")).toHaveLength(1));
  const input = screen.getByLabelText("Couleur hexadécimale");
  expect(input).toHaveValue("#112233");
  expect(old.onCancel).toHaveBeenCalled();
  expect(old.onCommit).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "#445566" } });
  const next = callbacks[second as keyof typeof callbacks];
  expect(next.onPreview).toHaveBeenCalledExactlyOnceWith("#445566");
  expect(old.onCancel.mock.invocationCallOrder[0]).toBeLessThan(
    next.onStart.mock.invocationCallOrder[0]!,
  );
  fireEvent.pointerUp(input);
  expect(next.onCommit).toHaveBeenCalledExactlyOnceWith("#445566");
  expect(old.onCommit).not.toHaveBeenCalled();
});
test("reset labels use shared feedback, skip already-default values and cannot open the picker", () => {
  const d = setup(),
    onReset = vi.fn(),
    onCommit = vi.fn();
  const properties = {
    label: "Palette",
    value: "#112233",
    resetValue: "#abcdef",
    disabled: false,
    onReset,
    onCommit,
    onPreview: vi.fn(),
  };
  const view = d.mount(<EffectColor {...properties} />);
  const reset = screen.getByRole("button", { name: / · Palette$/ });
  fireEvent.doubleClick(reset);
  expect(onReset).toHaveBeenCalledOnce();
  expect(reset.closest(".effect-color-field")).toHaveAttribute("data-resetting");
  expect(screen.queryByLabelText("Couleur hexadécimale")).not.toBeInTheDocument();
  expect(onCommit).not.toHaveBeenCalled();
  view.rerender(<EffectColor {...properties} value="#ABCDEF" />);
  fireEvent.doubleClick(reset);
  expect(onReset).toHaveBeenCalledOnce();
  expect(reset.closest(".effect-color-field")).toHaveAttribute("data-resetting");
  view.rerender(<EffectColor {...properties} disabled />);
  fireEvent.doubleClick(reset);
  expect(onReset).toHaveBeenCalledOnce();
  view.unmount();
});

test("keyboard activation resets a color through the same feedback without resetting on one mouse click", async () => {
  const d = setup(),
    user = userEvent.setup(),
    onReset = vi.fn(),
    onCommit = vi.fn();
  const props = {
    label: "Palette",
    value: "#112233",
    resetValue: "#abcdef",
    disabled: false,
    onReset,
    onCommit,
    onPreview: vi.fn(),
  };
  const view = d.mount(<EffectColor {...props} />);
  const reset = screen.getByRole("button", { name: / · Palette$/ });
  reset.focus();
  await user.keyboard("{Enter}");
  expect(onReset).toHaveBeenCalledOnce();
  expect(reset.closest(".effect-color-field")).toHaveAttribute("data-resetting");
  expect(screen.queryByLabelText("Couleur hexadécimale")).not.toBeInTheDocument();
  expect(onCommit).not.toHaveBeenCalled();
  view.rerender(<EffectColor {...props} value="#ABCDEF" />);
  await user.keyboard(" ");
  expect(onReset).toHaveBeenCalledOnce();
  expect(reset.closest(".effect-color-field")).toHaveAttribute("data-resetting");
  view.rerender(<EffectColor {...props} />);
  await user.keyboard(" ");
  expect(onReset).toHaveBeenCalledTimes(2);
  fireEvent.click(reset, { detail: 1 });
  expect(onReset).toHaveBeenCalledTimes(2);
  view.rerender(<EffectColor {...props} disabled />);
  fireEvent.click(reset, { detail: 0 });
  expect(onReset).toHaveBeenCalledTimes(2);
});
