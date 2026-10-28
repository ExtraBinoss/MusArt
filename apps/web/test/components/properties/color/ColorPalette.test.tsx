import { expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { setup } from "../../../support/ui";
import { ColorPalette } from "../../../../src/components/properties/color/ColorPalette";
it("uses genuine vertical hue/alpha sliders, previews keyboard changes without committing and retains independent alpha", () => {
  const { mount } = setup(),
    preview = vi.fn(),
    commit = vi.fn();
  mount(<ColorPalette value="#00ff0080" onPreview={preview} onCommit={commit} />);
  const hue = screen.getByRole("slider", { name: "Teinte" }),
    alpha = screen.getByRole("slider", { name: "Transparence" });
  expect(hue).toHaveAttribute("aria-orientation", "vertical");
  expect(alpha).toHaveAttribute("aria-orientation", "vertical");
  fireEvent.keyDown(hue, { key: "ArrowDown" });
  expect(preview.mock.calls.at(-1)![0]).toMatch(/^#[\da-f]{6}80$/);
  fireEvent.keyDown(alpha, { key: "ArrowUp" });
  expect(preview).toHaveBeenCalledTimes(2);
  expect(preview.mock.calls.at(-1)![0]).not.toMatch(/80$/);
  expect(commit).not.toHaveBeenCalled();
  const saturation = document.querySelector('.react-colorful__saturation [role="slider"]')!;
  fireEvent.keyDown(saturation, { key: "ArrowLeft", keyCode: 37, which: 37 });
  fireEvent.keyUp(saturation, { key: "ArrowLeft", keyCode: 37, which: 37 });
  expect(preview).toHaveBeenCalledTimes(3);
  expect(commit).toHaveBeenCalledOnce();
});

it("changes canonical colors without remounting or measuring the Radix slider thumbs", () => {
  const d = setup(),
    props = { onPreview: vi.fn(), onCommit: vi.fn() },
    view = d.mount(<ColorPalette value="#3366ff" {...props} />),
    hue = screen.getByRole("slider", { name: "Teinte" });
  const width = vi.spyOn(HTMLElement.prototype, "offsetWidth", "get"),
    height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get");
  view.rerender(<ColorPalette value="#ff000080" {...props} />);
  expect(screen.getByRole("slider", { name: "Teinte" })).toBe(hue);
  expect(hue).toHaveAttribute("aria-valuenow", "0");
  expect(width).not.toHaveBeenCalled();
  expect(height).not.toHaveBeenCalled();
});
