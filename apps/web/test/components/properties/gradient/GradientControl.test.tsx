import { act, fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { FillGradient, Layer } from "@musart/core";
import { GradientControl } from "../../../../src/components/properties/gradient/GradientControl";
import { previewAtom, useEngine } from "../../../../src/state/session/editor";
import { choose } from "../../../support/select";
import { setup } from "../../../support/ui";

const gradient: FillGradient = {
  kind: "linear",
  angle: 20,
  stops: [
    { offset: 0, color: "#ff0000" },
    { offset: 0.5, color: "#00ff00" },
    { offset: 1, color: "#0000ff" },
  ],
};

function mount(paint?: FillGradient, locked = false) {
  const data = setup();
  data.engine.execute({
    type: "updateLayers",
    ids: [data.text.id],
    patch: { fillGradient: paint, locked },
  });
  data.engine.load(data.engine.getSnapshot().project);
  const changed = vi.fn(),
    rendered = vi.fn();
  data.engine.subscribe(changed);
  function Live() {
    rendered();
    const state = useEngine(data.engine),
      layer = state.project.pages[0]!.layers.find((item) => item.id === data.text.id)!;
    function cancel() {
      data.store.set(previewAtom, null);
    }
    return (
      <GradientControl
        layer={layer}
        patch={(patch: Partial<Layer>) => {
          cancel();
          data.engine.execute({ type: "updateLayers", ids: [layer.id], patch });
        }}
        preview={(patch: Partial<Layer>) =>
          data.store.set(previewAtom, { target: "layer", layerId: layer.id, patch })
        }
        cancel={cancel}
      />
    );
  }
  data.mount(<Live />);
  return {
    ...data,
    changed,
    rendered,
    layer: () =>
      data.engine.getSnapshot().project.pages[0]!.layers.find((item) => item.id === data.text.id)!,
  };
}

test("switches paint with a shared segmented control and keeps the saved solid color", async () => {
  const data = mount();
  expect(screen.getByRole("radiogroup", { name: "Type de remplissage" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "Uni" })).toHaveAttribute("data-state", "checked");
  expect(screen.queryByLabelText("Angle du dégradé")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Dégradé" }));
  expect(data.layer().fillGradient).toEqual({
    kind: "linear",
    angle: 0,
    stops: [
      { offset: 0, color: data.text.fill },
      { offset: 1, color: "#ffffff" },
    ],
  });
  expect(screen.getByLabelText("Position du point 1")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Supprimer le point 1" })).toBeDisabled();
  await choose("Type de dégradé", "Radial");
  expect(data.layer().fillGradient?.kind).toBe("radial");
  expect(screen.queryByLabelText("Angle du dégradé")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Uni" }));
  expect(data.layer().fillGradient).toBeUndefined();
  expect(data.layer().fill).toBe(data.text.fill);
  act(() => data.engine.undo());
  expect(data.layer().fillGradient?.kind).toBe("radial");
});

test("previews angle/position without a document update or parent render and commits once", () => {
  const data = mount(gradient),
    angle = screen.getByLabelText("Angle du dégradé");
  const renders = data.rendered.mock.calls.length;
  angle.focus();
  fireEvent.change(angle, { target: { value: "85" } });
  expect(data.changed).not.toHaveBeenCalled();
  expect(data.rendered).toHaveBeenCalledTimes(renders);
  expect(data.layer().fillGradient?.angle).toBe(20);
  expect(data.store.get(previewAtom)).toMatchObject({ patch: { fillGradient: { angle: 85 } } });
  fireEvent.keyDown(angle, { key: "Escape" });
  expect(data.store.get(previewAtom)).toBeNull();
  expect(data.changed).not.toHaveBeenCalled();
  fireEvent.change(angle, { target: { value: "60" } });
  fireEvent.blur(angle);
  expect(data.changed).toHaveBeenCalledTimes(1);
  expect(data.layer().fillGradient?.angle).toBe(60);
  const position = screen.getByLabelText("Position du point 2");
  fireEvent.change(position, { target: { value: "75" } });
  expect(data.layer().fillGradient?.stops[1]?.offset).toBe(0.5);
  expect(screen.getByRole("slider", { name: "Point 2" })).toHaveAttribute("aria-valuenow", "75");
  fireEvent.blur(position);
  expect(data.layer().fillGradient?.stops[1]?.offset).toBe(0.75);
  act(() => data.engine.undo());
  expect(data.layer().fillGradient?.stops[1]?.offset).toBe(0.5);
});

test("edits compact hex and opacity rows through previews, cancellation and undo", () => {
  const data = mount(gradient);
  const color = screen.getByLabelText("Couleur hexadécimale du point 2");
  color.focus();
  fireEvent.change(color, { target: { value: "#33ccff80" } });
  expect(data.layer().fillGradient?.stops[1]?.color).toBe("#00ff00");
  expect(data.changed).not.toHaveBeenCalled();
  expect(data.store.get(previewAtom)).toMatchObject({
    patch: {
      fillGradient: { stops: [gradient.stops[0], { color: "#33ccff80" }, gradient.stops[2]] },
    },
  });
  fireEvent.keyDown(color, { key: "Escape" });
  expect(data.store.get(previewAtom)).toBeNull();
  color.focus();
  fireEvent.change(color, { target: { value: "#113355" } });
  fireEvent.blur(color);
  expect(data.changed).toHaveBeenCalledTimes(1);
  expect(data.layer().fillGradient?.stops[1]?.color).toBe("#113355");
  const opacity = screen.getByLabelText("Opacité du point 2");
  fireEvent.change(opacity, { target: { value: "50" } });
  expect(data.layer().fillGradient?.stops[1]?.color).toBe("#113355");
  fireEvent.blur(opacity);
  expect(data.layer().fillGradient?.stops[1]?.color).toBe("#11335580");
  act(() => data.engine.undo());
  expect(data.layer().fillGradient?.stops[1]?.color).toBe("#113355");
});

test("adds sampled stops in the widest interval, protects endpoints and caps at eight", () => {
  const data = mount(gradient);
  fireEvent.click(screen.getByRole("button", { name: "Ajouter un point de couleur" }));
  expect(data.layer().fillGradient?.stops.map((stop) => stop.offset)).toEqual([0, 0.25, 0.5, 1]);
  expect(data.layer().fillGradient?.stops[1]?.color).toBe("#808000ff");
  expect(screen.getByRole("slider", { name: "Point 2" })).toHaveAttribute("data-selected", "true");
  fireEvent.click(screen.getByRole("button", { name: "Supprimer le point 2" }));
  expect(data.layer().fillGradient).toEqual(gradient);
  for (let index = 0; index < 5; index++)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un point de couleur" }));
  expect(data.layer().fillGradient?.stops).toHaveLength(8);
  expect(screen.getByRole("button", { name: "Ajouter un point de couleur" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Supprimer le point 8" })).toBeDisabled();
});

test("opens the shared color palette from a stop swatch and commits one color edit", () => {
  const data = mount(gradient);
  fireEvent.click(screen.getByRole("button", { name: "Couleur du point 2" }));
  const color = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.change(color, { target: { value: "#aabbcc" } });
  expect(data.changed).not.toHaveBeenCalled();
  fireEvent.blur(color);
  expect(data.layer().fillGradient?.stops[1]?.color).toBe("#aabbcc");
  expect(data.changed).toHaveBeenCalledTimes(1);
});

test("disables segmented, gradient and stop controls for a locked layer", () => {
  mount(gradient, true);
  expect(screen.getByRole("radio", { name: "Uni" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "Type de dégradé" })).toBeDisabled();
  expect(screen.getByLabelText("Couleur hexadécimale du point 1")).toBeDisabled();
  expect(screen.getByRole("slider", { name: "Point 2" })).toBeDisabled();
  expect(screen.getByRole("img", { name: "Aperçu du dégradé" }).closest("[inert]")).not.toBeNull();
});
