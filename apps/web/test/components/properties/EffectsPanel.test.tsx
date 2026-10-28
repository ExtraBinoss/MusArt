import { expect, test } from "vitest";
import { screen, fireEvent, within, act } from "@testing-library/react";
import { createEffect } from "@musart/core";
import { EffectsPanel } from "../../../src/components/properties/EffectsPanel";
import { useEngine, previewAtom } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
test("adds a clipped effect, previews numbers without document changes, commits and toggles effects", async () => {
  const data = setup();
  data.engine.execute({
    type: "updateLayers",
    ids: [data.rectangle.id],
    patch: { effects: [createEffect("dither"), createEffect("ascii"), createEffect("brightness")] },
  });
  data.engine.load(data.engine.getSnapshot().project);
  function Live() {
    const layer = useEngine(data.engine).project.pages[0]!.layers[0]!;
    return (
      <EffectsPanel
        layer={layer}
        onPatch={(patch) => {
          data.store.set(previewAtom, null);
          data.engine.execute({ type: "updateLayers", ids: [layer.id], patch });
        }}
        onPreview={(patch) =>
          data.store.set(previewAtom, { target: "layer", layerId: layer.id, patch })
        }
        onCancel={() => data.store.set(previewAtom, null)}
      />
    );
  }
  data.mount(<Live />);
  fireEvent.pointerDown(screen.getByLabelText("Ajouter un effet"), { button: 0, ctrlKey: false });
  fireEvent.keyDown(await screen.findByRole("menuitem", { name: "Ajouter un effet" }), {
    key: "ArrowRight",
  });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Flou" }));
  expect(data.engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toHaveLength(4);
  function card() {
    return within(
      screen.getByText("Dither", { selector: "strong" }).closest(".effect-card") as HTMLElement,
    );
  }
  for (const [label, value] of [
    ["Intensité", "60"],
    ["Taille du motif", "4"],
    ["Niveaux", "4"],
  ]) {
    const input = card().getByRole("textbox", { name: label });
    fireEvent.change(input, { target: { value } });
    expect(data.store.get(previewAtom)?.target).toBe("layer");
    fireEvent.blur(input);
  }
  expect(data.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]).toMatchObject({
    amount: 0.6,
    scale: 4,
    levels: 4,
  });
  fireEvent.click(card().getByRole("switch", { name: "Couleur" }));
  fireEvent.click(card().getByRole("switch", { name: "Désactiver l’effet" }));
  expect(data.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.enabled).toBe(false);
  fireEvent.click(card().getByRole("switch", { name: "Activer l’effet" }));
  fireEvent.keyDown(card().getByLabelText("Intensité"), { key: "Escape" });
  expect(data.store.get(previewAtom)).toBeNull();
  fireEvent.click(card().getByLabelText("Retirer l’effet"));
  expect(data.engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toHaveLength(3);
});
test("offers an empty stack explanation", () => {
  const data = setup();
  data.mount(
    <EffectsPanel layer={data.rectangle} onPatch={() => undefined} onPreview={() => undefined} />,
  );
  expect(screen.getByText("Ajoutez un effet à ce calque.")).toBeVisible();
});

test("reorders the non-destructive effect stack as one undoable command", async () => {
  const data = setup();
  const { createEffect } = await import("@musart/core");
  const first = createEffect("dither");
  const second = createEffect("contrast");
  data.engine.execute({
    type: "updateLayers",
    ids: [data.rectangle.id],
    patch: { effects: [first, second] },
  });
  data.engine.load(data.engine.getSnapshot().project);
  function Live() {
    const snapshot = useEngine(data.engine);
    const layer = snapshot.project.pages[0]!.layers[0]!;
    return (
      <EffectsPanel
        layer={layer}
        onPatch={(patch) => data.engine.execute({ type: "updateLayers", ids: [layer.id], patch })}
        onPreview={(patch) =>
          data.store.set(previewAtom, { target: "layer", layerId: layer.id, patch })
        }
      />
    );
  }
  data.mount(<Live />);
  function card(name: string) {
    return within(
      screen.getByText(name, { selector: "strong" }).closest(".effect-card") as HTMLElement,
    );
  }
  expect(card("Dither").getByLabelText("Monter l’effet")).toBeDisabled();
  expect(card("Contraste").getByLabelText("Descendre l’effet")).toBeDisabled();
  fireEvent.click(card("Dither").getByLabelText("Descendre l’effet"));
  expect(data.engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toEqual([second, first]);
  act(() => data.engine.undo());
  expect(data.engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toEqual([first, second]);
  expect(data.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.click(card("Contraste").getByLabelText("Monter l’effet"));
  expect(data.engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toEqual([second, first]);
});
