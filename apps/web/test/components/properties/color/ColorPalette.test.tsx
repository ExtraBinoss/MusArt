import { expect, it, vi } from "vitest";
import { createElement, StrictMode, type ComponentProps } from "react";
import { act, fireEvent, screen } from "@testing-library/react";
import { setup } from "../../../support/ui";
import { ColorPalette } from "../../../../src/components/properties/color/ColorPalette";
const callbacks = vi.hoisted(
  () =>
    [] as {
      onChange?: (color: { h: number; s: number; v: number }) => void;
      onChangeEnd?: (color: { h: number; s: number; v: number }) => void;
    }[],
);
vi.mock("react-colorful", async (original) => {
  const actual = await original<typeof import("react-colorful")>();
  return {
    ...actual,
    HsvColorPicker: (props: ComponentProps<typeof actual.HsvColorPicker>) => {
      callbacks.push(props);
      return createElement(actual.HsvColorPicker, props);
    },
  };
});
function sv() {
  const pad = document.querySelector<HTMLElement>(".react-colorful__saturation")!;
  vi.spyOn(pad, "getBoundingClientRect").mockReturnValue({
    left: 10,
    top: 20,
    width: 100,
    height: 100,
  } as DOMRect);
  return pad.querySelector<HTMLElement>('[role="slider"]')!;
}
function pointer(target: HTMLElement | Window, type: string, x: number, y: number, id = 1) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, "pointerId", { value: id });
  fireEvent(target, event);
}
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

it("synchronously flushes SV release, retires late widget callbacks, then accepts the next gesture and keyboard", () => {
  const d = setup(),
    values: string[] = [],
    commits: string[] = [],
    preview = vi.fn((hex: string) => {
      values.push(hex);
    }),
    commit = vi.fn(() => {
      commits.push(values.at(-1)!);
    });
  d.mount(<ColorPalette value="#ff000080" onPreview={preview} onCommit={commit} />);
  const pad = sv(),
    previous = callbacks.at(-1)!;
  act(() => {
    pointer(pad, "pointerdown", 30, 40);
    pointer(window, "pointermove", 90, 90);
    pointer(window, "pointerup", 85, 95);
    previous.onChange?.({ h: 120, s: 100, v: 100 });
    previous.onChangeEnd?.({ h: 120, s: 100, v: 100 });
  });
  expect(commits).toEqual(["#40101080"]);
  expect(preview).toHaveBeenCalledTimes(3);
  expect(values.at(-1)).toBe("#40101080");
  const nextPad = sv();
  act(() => {
    pointer(nextPad, "pointerdown", 50, 50);
    pointer(window, "pointermove", 90, 60);
    pointer(window, "pointerup", 100, 60);
  });
  expect(commits).toEqual(["#40101080", "#990f0f80"]);
  const keyboard = document.querySelector('.react-colorful__saturation [role="slider"]')!;
  fireEvent.keyDown(keyboard, { key: "ArrowLeft", keyCode: 37, which: 37 });
  fireEvent.keyUp(keyboard, { key: "ArrowLeft", keyCode: 37, which: 37 });
  expect(commits).toEqual(["#40101080", "#990f0f80", "#99171780"]);
});

it("cancels SV ownership and rejects callbacks from cancelled or replaced palettes", () => {
  const d = setup(),
    preview = vi.fn(),
    commit = vi.fn(),
    cancel = vi.fn();
  const view = d.mount(
    <ColorPalette value="#ff000080" onPreview={preview} onCommit={commit} onCancel={cancel} />,
  );
  const pad = sv(),
    retired = callbacks.at(-1)!;
  pointer(pad, "pointerdown", 30, 40);
  pointer(window, "pointermove", 90, 90);
  pointer(window, "pointercancel", 90, 90);
  const calls = preview.mock.calls.length;
  act(() => {
    retired.onChange?.({ h: 120, s: 100, v: 100 });
    retired.onChangeEnd?.({ h: 120, s: 100, v: 100 });
  });
  pointer(window, "pointerup", 100, 100);
  expect(cancel).toHaveBeenCalledOnce();
  expect(commit).not.toHaveBeenCalled();
  expect(preview).toHaveBeenCalledTimes(calls);
  const active = sv(),
    oldOwner = callbacks.at(-1)!;
  pointer(active, "pointerdown", 50, 50);
  view.rerender(
    <ColorPalette
      value="#0000ff80"
      resetKey="replacement"
      onPreview={preview}
      onCommit={commit}
      onCancel={cancel}
    />,
  );
  const beforeRelease = preview.mock.calls.length;
  act(() => {
    oldOwner.onChange?.({ h: 120, s: 100, v: 100 });
    oldOwner.onChangeEnd?.({ h: 120, s: 100, v: 100 });
  });
  pointer(window, "pointerup", 100, 100);
  expect(preview).toHaveBeenCalledTimes(beforeRelease);
  expect(commit).not.toHaveBeenCalled();
  const remove = vi.spyOn(window, "removeEventListener");
  view.unmount();
  expect(remove).toHaveBeenCalledWith("pointerup", expect.any(Function), true);
  expect(remove).toHaveBeenCalledWith("pointermove", expect.any(Function), true);
  expect(remove).toHaveBeenCalledWith("pointercancel", expect.any(Function), true);
});

it("accepts the StrictMode setup replay but rejects retained widget callbacks after actual unmount", () => {
  const d = setup(),
    preview = vi.fn(),
    commit = vi.fn();
  const view = d.mount(
    <StrictMode>
      <ColorPalette value="#ff000080" onPreview={preview} onCommit={commit} />
    </StrictMode>,
  );
  const pad = sv();
  pointer(pad, "pointerdown", 30, 40);
  pointer(window, "pointermove", 90, 90);
  pointer(window, "pointerup", 85, 95);
  expect(preview).toHaveBeenLastCalledWith("#40101080");
  expect(commit).toHaveBeenCalledOnce();
  const retained = callbacks.at(-1)!;
  const calls = preview.mock.calls.length;
  view.unmount();
  act(() => {
    retained.onChange?.({ h: 120, s: 100, v: 100 });
    retained.onChangeEnd?.({ h: 120, s: 100, v: 100 });
  });
  expect(preview).toHaveBeenCalledTimes(calls);
  expect(commit).toHaveBeenCalledOnce();
});
