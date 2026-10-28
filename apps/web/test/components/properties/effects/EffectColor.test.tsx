import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
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
