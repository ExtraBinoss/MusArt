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

function mount(gradient?: FillGradient, locked = false) {
  const data = setup();
  data.engine.execute({
    type: "updateLayers",
    ids: [data.text.id],
    patch: { fillGradient: gradient, locked },
  });
  data.engine.load(data.engine.getSnapshot().project);
  const changed = vi.fn();
  data.engine.subscribe(changed);
  function Live() {
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
    layer: () =>
      data.engine.getSnapshot().project.pages[0]!.layers.find((item) => item.id === data.text.id)!,
  };
}

test("switches between solid, linear and radial paint without replacing the saved solid fill", async () => {
  const data = mount();
  expect(screen.queryByLabelText("Angle du dégradé")).toBeNull();
  await choose("Type de remplissage", "Dégradé linéaire");
  expect(data.layer().fillGradient).toEqual({
    kind: "linear",
    angle: 0,
    stops: [
      { offset: 0, color: data.text.fill },
      { offset: 1, color: "#ffffff" },
    ],
  });
  expect(screen.getByLabelText("Position du point")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Supprimer le point sélectionné" })).toBeDisabled();
  await choose("Type de remplissage", "Dégradé radial");
  expect(data.layer().fillGradient?.kind).toBe("radial");
  expect(screen.queryByLabelText("Angle du dégradé")).toBeNull();
  await choose("Type de remplissage", "Uni");
  expect(data.layer().fillGradient).toBeUndefined();
  expect(data.layer().fill).toBe(data.text.fill);
  act(() => data.engine.undo());
  expect(data.layer().fillGradient?.kind).toBe("radial");
});

test("previews angle and stop position without a document update, cancels and commits once", () => {
  const data = mount(gradient),
    angle = screen.getByLabelText("Angle du dégradé");
  angle.focus();
  fireEvent.change(angle, { target: { value: "85" } });
  expect(data.changed).not.toHaveBeenCalled();
  expect(data.layer().fillGradient?.angle).toBe(20);
  expect(data.store.get(previewAtom)).toMatchObject({ patch: { fillGradient: { angle: 85 } } });
  expect(screen.getByRole("img", { name: "Aperçu du dégradé" }).getAttribute("style")).toContain(
    "175deg",
  );
  fireEvent.keyDown(angle, { key: "Escape" });
  expect(data.store.get(previewAtom)).toBeNull();
  expect(data.changed).not.toHaveBeenCalled();
  expect(screen.getByRole("img", { name: "Aperçu du dégradé" }).getAttribute("style")).toContain(
    "110deg",
  );
  fireEvent.change(angle, { target: { value: "60" } });
  fireEvent.blur(angle);
  expect(data.changed).toHaveBeenCalledTimes(1);
  expect(data.layer().fillGradient?.angle).toBe(60);
  fireEvent.click(screen.getByRole("button", { name: "Point 2" }));
  const position = screen.getByLabelText("Position du point");
  expect(position).not.toBeDisabled();
  fireEvent.change(position, { target: { value: "75" } });
  expect(data.layer().fillGradient?.stops[1]?.offset).toBe(0.5);
  expect(data.store.get(previewAtom)).toMatchObject({
    patch: { fillGradient: { stops: [gradient.stops[0], { offset: 0.75 }, gradient.stops[2]] } },
  });
  fireEvent.blur(position);
  expect(data.layer().fillGradient?.stops[1]?.offset).toBe(0.75);
  act(() => data.engine.undo());
  expect(data.layer().fillGradient?.stops[1]?.offset).toBe(0.5);
});

test("keeps stop colors on the preview path until gesture completion and restores cancellation", () => {
  const data = mount(gradient);
  fireEvent.click(screen.getByRole("button", { name: "Point 2" }));
  const color = screen.getByLabelText("Couleur hexadécimale");
  fireEvent.change(color, { target: { value: "#33ccff80" } });
  expect(data.layer().fillGradient?.stops[1]?.color).toBe("#00ff00");
  expect(data.changed).not.toHaveBeenCalled();
  expect(data.store.get(previewAtom)).toMatchObject({
    patch: {
      fillGradient: { stops: [gradient.stops[0], { color: "#33ccff80" }, gradient.stops[2]] },
    },
  });
  fireEvent.pointerCancel(color);
  expect(data.store.get(previewAtom)).toBeNull();
  fireEvent.change(color, { target: { value: "#113355" } });
  fireEvent.pointerUp(color);
  expect(data.changed).toHaveBeenCalledTimes(1);
  expect(data.layer().fillGradient?.stops[1]?.color).toBe("#113355");
  expect(data.store.get(previewAtom)).toBeNull();
  act(() => data.engine.undo());
  expect(data.layer().fillGradient).toEqual(gradient);
});

test("adds points inside the widest interval, protects endpoints and caps the list at eight", () => {
  const data = mount(gradient);
  fireEvent.click(screen.getByRole("button", { name: "Ajouter un point de couleur" }));
  expect(data.layer().fillGradient?.stops.map((stop) => stop.offset)).toEqual([0, 0.25, 0.5, 1]);
  expect(data.layer().fillGradient?.stops[1]?.color).toBe("#808000ff");
  expect(screen.getByRole("button", { name: "Point 2" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Supprimer le point sélectionné" }));
  expect(data.layer().fillGradient).toEqual(gradient);
  for (let index = 0; index < 5; index++)
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un point de couleur" }));
  expect(data.layer().fillGradient?.stops).toHaveLength(8);
  expect(screen.getByRole("button", { name: "Ajouter un point de couleur" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Point 8" }));
  expect(screen.getByRole("button", { name: "Supprimer le point sélectionné" })).toBeDisabled();
});

test("marks locked paint controls inert and disables fill type changes", () => {
  mount(gradient, true);
  expect(screen.getByRole("combobox", { name: "Type de remplissage" })).toBeDisabled();
  expect(screen.getByRole("img", { name: "Aperçu du dégradé" }).parentElement).toHaveAttribute(
    "inert",
  );
});
