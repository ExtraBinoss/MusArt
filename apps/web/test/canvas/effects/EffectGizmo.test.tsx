import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createEffect } from "@musart/core";
import { setup } from "../../support/ui";
import { EffectGizmo } from "../../../src/canvas/effects/EffectGizmo";
import { SceneController } from "../../../src/canvas/session/scene-controller";
import { createPreviewSource } from "../../../src/state/session/preview-source";
import { previewAtom } from "../../../src/state/session/editor";
import { attachmentSelection } from "../../../src/state/selection/attachments";

function fixture(type: "ripple" | "flashlight" = "ripple") {
  const d = setup(),
    effect = createEffect(type);
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { effects: [effect] } });
  const page = d.engine.getSnapshot().project.pages[0]!;
  attachmentSelection(d.engine).select(page, {
    kind: "effect",
    pageId: page.id,
    layerId: d.rectangle.id,
    effectId: effect.id,
  });
  const controller = new SceneController(d.engine, createPreviewSource(d.store));
  const listeners = new Set<() => void>();
  let zoom = 1;
  const viewSource = {
    read: () => ({ x: 0, y: 0, zoom }),
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  const result = d.mount(
    <EffectGizmo engine={d.engine} controller={controller} viewSource={viewSource} />,
  );
  const svg = result.container.querySelector("svg") as SVGSVGElement;
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 1080,
    bottom: 1080,
    width: 1080,
    height: 1080,
    toJSON() {},
  });
  svg.setPointerCapture = vi.fn();
  svg.hasPointerCapture = () => true;
  svg.releasePointerCapture = vi.fn();
  return {
    ...d,
    ...result,
    svg,
    effect,
    listeners,
    setZoom: (value: number) => {
      zoom = value;
      listeners.forEach((fn) => fn());
    },
  };
}
it("paints live geometry without a document commit, commits once, and undoes the entire gesture", () => {
  const d = fixture(),
    before = d.engine.getSnapshot().project,
    execute = vi.spyOn(d.engine, "execute");
  const handle = screen.getByRole("button", { name: "Centre de l’effet" });
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1 });
  fireEvent.pointerMove(d.svg, { pointerId: 1, clientX: 70, clientY: 80 });
  expect(execute).not.toHaveBeenCalled();
  expect(d.store.get(previewAtom)).not.toBeNull();
  expect(d.svg.querySelector(".effect-gizmo-area")).toHaveAttribute(
    "transform",
    "translate(50 50) rotate(0)",
  );
  fireEvent.pointerUp(d.svg, { pointerId: 1, clientX: 70, clientY: 80 });
  expect(execute).toHaveBeenCalledOnce();
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.settings).toMatchObject({
    centerX: 0.25,
    centerY: 0.5,
  });
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
  act(() => d.setZoom(2));
  expect(handle).toHaveAttribute("r", "3");
  d.unmount();
  expect(d.listeners.size).toBe(0);
});
it("restores on Escape, handles keyboard geometry and relative ellipses", () => {
  const d = fixture("flashlight"),
    before = d.engine.getSnapshot().project;
  const center = screen.getByRole("button", { name: "Centre de l’effet" });
  fireEvent.pointerDown(center, { button: 0, pointerId: 2 });
  fireEvent.pointerMove(d.svg, { pointerId: 2, clientX: 90, clientY: 60 });
  fireEvent.keyDown(center, { key: "Escape" });
  expect(d.engine.getSnapshot().project).toBe(before);
  expect(d.store.get(previewAtom)).toBeNull();
  fireEvent.keyDown(center, { key: "ArrowRight", shiftKey: true });
  expect(d.engine.getSnapshot().project).toBe(before);
  fireEvent.keyUp(center, { key: "ArrowRight" });
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.settings!.centerX,
  ).toBeCloseTo(0.55);
  expect(d.svg.querySelector('[data-handle="innerRadius"]')).toHaveStyle({ display: "none" });
});
it("groups repeated keyboard steps into one undo entry and cancels the entire keyboard gesture", () => {
  const d = fixture("flashlight"),
    execute = vi.spyOn(d.engine, "execute");
  const before = d.engine.getSnapshot().project,
    center = screen.getByRole("button", { name: "Centre de l’effet" });
  fireEvent.keyDown(center, { key: "ArrowRight" });
  for (let i = 0; i < 4; i++) fireEvent.keyDown(center, { key: "ArrowRight", repeat: true });
  expect(execute).not.toHaveBeenCalled();
  expect(d.store.get(previewAtom)).not.toBeNull();
  fireEvent.keyUp(center, { key: "ArrowRight" });
  expect(execute).toHaveBeenCalledOnce();
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.settings!.centerX,
  ).toBeCloseTo(0.525);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before);
  fireEvent.keyDown(center, { key: "ArrowDown" });
  fireEvent.keyDown(center, { key: "Escape" });
  fireEvent.keyUp(center, { key: "ArrowDown" });
  expect(d.engine.getSnapshot().project).toEqual(before);
});
it("ignores foreign pointers and releases capture explicitly on cancellation", () => {
  const d = fixture(),
    center = screen.getByRole("button", { name: "Centre de l’effet" });
  const before = d.engine.getSnapshot().project;
  fireEvent.pointerDown(center, { button: 0, pointerId: 1 });
  fireEvent.pointerMove(d.svg, { pointerId: 1, clientX: 60, clientY: 70 });
  const preview = d.store.get(previewAtom);
  fireEvent.pointerDown(center, { button: 0, pointerId: 2 });
  fireEvent.pointerMove(d.svg, { pointerId: 2, clientX: 100, clientY: 100 });
  fireEvent.pointerCancel(d.svg, { pointerId: 2 });
  expect(d.store.get(previewAtom)).toBe(preview);
  fireEvent.keyDown(center, { key: "Escape" });
  expect(d.svg.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project).toBe(before);
});
it("cancels held keys when the window loses focus without a keyup", () => {
  const d = fixture(),
    center = screen.getByRole("button", { name: "Centre de l’effet" });
  const before = d.engine.getSnapshot().project;
  fireEvent.keyDown(center, { key: "ArrowRight" });
  expect(d.store.get(previewAtom)).not.toBeNull();
  fireEvent(window, new Event("blur"));
  expect(d.store.get(previewAtom)).toBeNull();
  fireEvent.keyUp(center, { key: "ArrowRight" });
  expect(d.engine.getSnapshot().project).toBe(before);
});
it("resolves overlapping screen-space handles by proximity, with center winning exact ties", () => {
  const d = fixture(),
    center = d.svg.querySelector<SVGCircleElement>('[data-handle="center"]')!,
    inner = d.svg.querySelector<SVGCircleElement>('[data-handle="innerRadius"]')!,
    radius = d.svg.querySelector<SVGCircleElement>('[data-handle="radius"]')!;
  const bounds = (x: number) => ({
    x: x - 6,
    y: 44,
    left: x - 6,
    top: 44,
    right: x + 6,
    bottom: 56,
    width: 12,
    height: 12,
    toJSON() {},
  });
  vi.spyOn(center, "getBoundingClientRect").mockReturnValue(bounds(50));
  const innerBounds = vi.spyOn(inner, "getBoundingClientRect").mockReturnValue(bounds(55.5));
  vi.spyOn(radius, "getBoundingClientRect").mockReturnValue(bounds(90));
  expect(center).toBe(d.svg.querySelector(".effect-gizmo-area")!.lastElementChild);
  // A painted inner handle may receive the DOM event over the center.
  fireEvent.pointerDown(inner, { button: 0, pointerId: 1, clientX: 50, clientY: 50 });
  expect(center).toHaveFocus();
  fireEvent.pointerUp(d.svg, { pointerId: 1, clientX: 70, clientY: 80 });
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.settings).toMatchObject({
    centerX: 0.25,
    centerY: 0.5,
  });
  act(() => d.engine.undo());
  // The reverse overlap still selects the inner radius at its own center.
  fireEvent.pointerDown(center, { button: 0, pointerId: 2, clientX: 55.5, clientY: 50 });
  expect(inner).toHaveFocus();
  fireEvent.keyDown(inner, { key: "Escape" });
  innerBounds.mockReturnValue(bounds(50));
  fireEvent.pointerDown(inner, { button: 0, pointerId: 3, clientX: 50, clientY: 50 });
  expect(center).toHaveFocus();
  fireEvent.keyDown(center, { key: "Escape" });
});
