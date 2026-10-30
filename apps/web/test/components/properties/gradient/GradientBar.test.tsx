import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { FillGradient } from "@musart/core";
import { GradientBar } from "../../../../src/components/properties/gradient/GradientBar";
import { setup } from "../../../support/ui";
import "../../../../src/components/properties/gradient/messages";

const gradient: FillGradient = {
  kind: "linear",
  angle: 0,
  stops: [
    { offset: 0, color: "#ff0000" },
    { offset: 0.5, color: "#00ff00" },
    { offset: 1, color: "#0000ff" },
  ],
};
function mount() {
  const onPreview = vi.fn(),
    onCommit = vi.fn(),
    onCancel = vi.fn(),
    onSelect = vi.fn();
  let invalidate = () => {};
  const unsubscribe = vi.fn();
  const invalidation = {
    subscribe: vi.fn((listener: () => void) => {
      invalidate = listener;
      return unsubscribe;
    }),
  };
  const props = {
    gradient,
    identity: "layer1",
    selected: 1,
    onPreview,
    onCommit,
    onCancel,
    onSelect,
    invalidation,
  };
  const view = setup().mount(<GradientBar {...props} />);
  const ramp = screen.getByRole("img", { name: "Aperçu du dégradé" });
  vi.spyOn(ramp, "getBoundingClientRect").mockReturnValue({ left: 10, width: 200 } as DOMRect);
  return {
    props,
    view,
    onPreview,
    onCommit,
    onCancel,
    onSelect,
    invalidate: () => invalidate(),
    unsubscribe,
  };
}

test("drags a stop imperatively, bounds it to neighbors and commits only on pointer completion", () => {
  const data = mount(),
    thumb = screen.getByRole("slider", { name: "Point 2" });
  fireEvent.pointerDown(thumb, { button: 0, clientX: 110 });
  fireEvent.pointerMove(thumb, { clientX: 160 });
  expect(data.onSelect).toHaveBeenCalledWith(1);
  expect(data.onPreview.mock.lastCall?.[0].stops[1].offset).toBe(0.75);
  expect(data.onCommit).not.toHaveBeenCalled();
  fireEvent.pointerMove(thumb, { clientX: 900 });
  expect(data.onPreview.mock.lastCall?.[0].stops[1].offset).toBe(1);
  fireEvent.pointerUp(thumb, { clientX: 900 });
  fireEvent.lostPointerCapture(thumb);
  expect(data.onCommit).toHaveBeenCalledTimes(1);
  expect(data.onCommit.mock.lastCall?.[0].stops[1].offset).toBe(1);
});

test("cancels pointer drafts on capture loss, escape, window blur, identity change and unmount", () => {
  const data = mount(),
    thumb = screen.getByRole("slider", { name: "Point 2" });
  const start = () => {
    fireEvent.pointerDown(thumb, { button: 0, clientX: 110 });
    fireEvent.pointerMove(thumb, { clientX: 150 });
  };
  start();
  fireEvent.pointerCancel(thumb);
  start();
  fireEvent.lostPointerCapture(thumb);
  start();
  fireEvent.keyDown(thumb, { key: "Escape" });
  start();
  fireEvent(window, new Event("blur"));
  start();
  data.view.rerender(<GradientBar {...data.props} identity="different" />);
  start();
  data.view.unmount();
  expect(data.onCancel).toHaveBeenCalledTimes(6);
  expect(data.onCommit).not.toHaveBeenCalled();
  expect(data.unsubscribe).toHaveBeenCalledTimes(1);
});

test("uses accessible keyboard bounds, accelerated arrows and one commit per held key", () => {
  const data = mount(),
    thumb = screen.getByRole("slider", { name: "Point 2" });
  fireEvent.keyDown(thumb, { key: "ArrowRight" });
  fireEvent.keyDown(thumb, { key: "ArrowRight", repeat: true });
  expect(data.onPreview.mock.lastCall?.[0].stops[1].offset).toBeCloseTo(0.52);
  expect(data.onCommit).not.toHaveBeenCalled();
  fireEvent.keyUp(thumb, { key: "ArrowRight" });
  expect(data.onCommit).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(thumb, { key: "ArrowLeft", shiftKey: true });
  expect(data.onPreview.mock.lastCall?.[0].stops[1].offset).toBeCloseTo(0.4);
  fireEvent.keyDown(thumb, { key: "Escape" });
  fireEvent.keyDown(thumb, { key: "ArrowLeft", repeat: true });
  fireEvent.keyUp(thumb, { key: "ArrowLeft" });
  expect(data.onCommit).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(thumb, { key: "End" });
  fireEvent.keyUp(thumb, { key: "End" });
  expect(data.onCommit.mock.lastCall?.[0].stops[1].offset).toBe(1);
  fireEvent.keyDown(thumb, { key: "Home" });
  fireEvent.keyUp(thumb, { key: "Home" });
  expect(data.onCommit.mock.lastCall?.[0].stops[1].offset).toBe(0);
});

test("keeps endpoints selectable and cancels stale edits when authored time changes", () => {
  const data = mount(),
    endpoint = screen.getByRole("slider", { name: "Point 1" });
  fireEvent.pointerDown(endpoint, { button: 0 });
  fireEvent.keyDown(endpoint, { key: "ArrowRight" });
  expect(data.onPreview).not.toHaveBeenCalled();
  expect(data.onSelect).toHaveBeenCalledWith(0);
  const thumb = screen.getByRole("slider", { name: "Point 2" });
  fireEvent.keyDown(thumb, { key: "ArrowRight" });
  act(() => data.invalidate());
  fireEvent.keyDown(thumb, { key: "ArrowRight", repeat: true });
  fireEvent.keyUp(thumb, { key: "ArrowRight" });
  expect(data.onCancel).toHaveBeenCalledTimes(1);
  expect(data.onCommit).not.toHaveBeenCalled();
  data.view.rerender(<GradientBar {...data.props} disabled />);
  fireEvent.pointerDown(thumb, { button: 0 });
  fireEvent.keyDown(thumb, { key: "ArrowRight" });
  expect(data.onPreview).toHaveBeenCalledTimes(1);
});

test("flushes the release coordinate and preserves where the pointer grabbed the thumb", () => {
  const data = mount(),
    thumb = screen.getByRole("slider", { name: "Point 2" });
  // The stop center is110px, but the user grabs its right edge at118px.
  fireEvent.pointerDown(thumb, { button: 0, clientX: 118 });
  fireEvent.pointerMove(thumb, { clientX: 120 });
  expect(data.onPreview.mock.lastCall?.[0].stops[1].offset).toBe(0.51);
  fireEvent.pointerUp(thumb, { clientX: 168 });
  expect(data.onPreview.mock.lastCall?.[0].stops[1].offset).toBe(0.75);
  expect(data.onCommit).toHaveBeenCalledExactlyOnceWith({
    ...gradient,
    stops: [gradient.stops[0], { ...gradient.stops[1], offset: 0.75 }, gradient.stops[2]],
  });
  fireEvent.lostPointerCapture(thumb);
  expect(data.onCancel).not.toHaveBeenCalled();
});

test("a click without travel never changes the stop, while pointer blur restores rather than commits", () => {
  const data = mount(),
    thumb = screen.getByRole("slider", { name: "Point 2" });
  fireEvent.pointerDown(thumb, { button: 0, clientX: 118 });
  fireEvent.pointerUp(thumb, { clientX: 118 });
  expect(data.onCommit).not.toHaveBeenCalled();
  fireEvent.pointerDown(thumb, { button: 0, clientX: 118 });
  fireEvent.pointerMove(thumb, { clientX: 160 });
  fireEvent.blur(thumb);
  fireEvent.pointerUp(thumb, { clientX: 170 });
  expect(data.onCommit).not.toHaveBeenCalled();
  expect(data.onCancel).toHaveBeenCalledTimes(2);
});
