import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { FillGradient } from "@musart/core";
import { GradientStopRow } from "../../../../src/components/properties/gradient/GradientStopRow";
import { setup } from "../../../support/ui";
import "../../../../src/components/properties/gradient/messages";

const gradient: FillGradient = {
  kind: "linear",
  angle: 0,
  stops: [
    { offset: 0, color: "#ff0000" },
    { offset: 0.5, color: "#00ff0080" },
    { offset: 1, color: "#0000ff" },
  ],
};
function mount() {
  const onPreview = vi.fn(),
    onCommit = vi.fn(),
    onCancel = vi.fn(),
    onSelect = vi.fn(),
    onRemove = vi.fn();
  const listeners = new Set<() => void>();
  const invalidation = {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const props = {
    gradient,
    index: 1,
    ownerId: "layer1",
    identity: gradient,
    selected: true,
    onPreview,
    onCommit,
    onCancel,
    onSelect,
    onRemove,
    invalidation,
  };
  const view = setup().mount(<GradientStopRow {...props} />);
  return {
    props,
    view,
    onPreview,
    onCommit,
    onCancel,
    onSelect,
    onRemove,
    invalidate: () => listeners.forEach((listener) => listener()),
    listeners,
  };
}

test("keeps inline RGB edits independent from opacity and commits once on enter", () => {
  const data = mount(),
    field = screen.getByLabelText("Couleur hexadécimale du point 2");
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: "abc" } });
  expect(data.onSelect).toHaveBeenCalled();
  expect(data.onPreview).toHaveBeenLastCalledWith({ color: "#aabbcc80" });
  expect(data.onCommit).not.toHaveBeenCalled();
  fireEvent.keyDown(field, { key: "Enter" });
  fireEvent.blur(field);
  expect(data.onCommit).toHaveBeenCalledExactlyOnceWith({ color: "#aabbcc80" });
});

test("rejects invalid hex, restores Escape and invalidates a draft on time or owner change", () => {
  const data = mount(),
    field = screen.getByLabelText("Couleur hexadécimale du point 2");
  fireEvent.change(field, { target: { value: "invalid" } });
  fireEvent.blur(field);
  expect(field).toHaveValue("#00FF00");
  expect(data.onCommit).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: "#ff0000" } });
  fireEvent.keyDown(field, { key: "Escape" });
  expect(field).toHaveValue("#00FF00");
  fireEvent.change(field, { target: { value: "#ff0000" } });
  act(() => data.invalidate());
  expect(field).toHaveValue("#00FF00");
  fireEvent.blur(field);
  expect(data.onCommit).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: "#ff0000" } });
  data.view.rerender(<GradientStopRow {...data.props} identity={{}} />);
  expect(data.onCancel).toHaveBeenCalled();
  expect(field).toHaveValue("#00FF00");
  data.view.unmount();
  expect(data.listeners.size).toBe(0);
});

test("exposes per-stop removal and permits removing a hard-edge interior stop", () => {
  const data = mount();
  fireEvent.click(screen.getByRole("button", { name: "Supprimer le point 2" }));
  expect(data.onRemove).toHaveBeenCalledTimes(1);
  const hardEdge = {
    ...gradient,
    stops: [gradient.stops[0]!, { offset: 0, color: "#ffffff" }, gradient.stops[2]!],
  };
  data.view.rerender(<GradientStopRow {...data.props} gradient={hardEdge} />);
  expect(screen.getByRole("button", { name: "Supprimer le point 2" })).not.toBeDisabled();
  data.view.rerender(<GradientStopRow {...data.props} index={0} />);
  expect(screen.getByRole("button", { name: "Supprimer le point 1" })).toBeDisabled();
});

test("cancels uncommitted hex input on pointer cancellation and unmount", () => {
  const data = mount(),
    field = screen.getByLabelText("Couleur hexadécimale du point 2");
  fireEvent.change(field, { target: { value: "#ff0000" } });
  fireEvent.pointerCancel(field);
  expect(field).toHaveValue("#00FF00");
  fireEvent.change(field, { target: { value: "#ff0000" } });
  data.view.unmount();
  expect(data.onCancel).toHaveBeenCalledTimes(2);
  expect(data.onCommit).not.toHaveBeenCalled();
});
