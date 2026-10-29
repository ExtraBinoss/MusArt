import { expect, test } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { LayerCompositing } from "../../../../src/components/layers/controls/LayerCompositing";
import { useEngine, previewAtom } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";
import { choose } from "../../../support/select";
import { i18n } from "../../../../src/state/i18n";
import { planMotionInitialization } from "@musart/core";
import { createMotionTransport } from "../../../../src/services/motion/transport";
import { motionPropertyTrack } from "../../../../src/state/session/motion-edit";
function fixture(selection: "none" | "single" | "mixed") {
  const d = setup();
  if (selection === "mixed")
    d.engine.execute({
      type: "updateLayers",
      ids: [d.text.id],
      patch: { opacity: 0.4, blendMode: "multiply" },
    });
  d.engine.select(
    selection === "none"
      ? []
      : selection === "single"
        ? [d.rectangle.id]
        : [d.rectangle.id, d.text.id],
  );
  function Live() {
    const snapshot = useEngine(d.engine);
    return (
      <LayerCompositing
        engine={d.engine}
        page={snapshot.project.pages[0]!}
        selection={snapshot.selection}
        run={d.run}
      />
    );
  }
  d.mount(<Live />);
  return d;
}
test("disables empty selection and presents mixed values until one absolute edit is committed", () => {
  fixture("none");
  expect(screen.getByRole("textbox", { name: "Opacité" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "Fusion" })).toBeDisabled();
});
test("a mixed selection keys every selected owner and an absolute opacity edit has one undo", () => {
  const d = fixture("mixed");
  act(() =>
    d.engine.execute({
      type: "setCompositionMode",
      mode: "motion",
      plan: planMotionInitialization(d.engine.getSnapshot()),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Ajouter une image clé · Opacité" }));
  act(() => createMotionTransport(d.engine).seek({ value: 1, rate: 1 }));
  const field = screen.getByRole("textbox", { name: "Opacité" }),
    before = d.engine.getSnapshot();
  expect(field).toHaveValue("");
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: "50" } });
  fireEvent.blur(field);
  const page = d.engine.getSnapshot().project.pages[0]!;
  expect(page.layers.slice(0, 2).map((layer) => layer.opacity)).toEqual([1, 0.4]);
  for (const layer of page.layers.slice(0, 2))
    expect(
      motionPropertyTrack(page, {
        kind: "layer",
        layerId: layer.id,
        property: "opacity",
      })?.keyframes.at(-1)?.value,
    ).toBe(0.5);
  expect(field).toHaveValue("50");
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toBe(before.project);
});

test("stable virtual-window parent props skip compositing renders while selected paint and language rebind", async () => {
  history.replaceState({}, "", "/?automation=1");
  const d = setup();
  d.engine.select([d.rectangle.id]);
  let snapshot = d.engine.getSnapshot();
  const props = {
    engine: d.engine,
    page: snapshot.project.pages[0]!,
    selection: snapshot.selection,
    run: d.run,
  };
  const view = d.mount(<LayerCompositing {...props} />),
    group = screen.getByRole("group", { name: "Composition des calques" });
  const initial = group.dataset.reactRenders;
  view.rerender(<LayerCompositing {...props} />);
  view.rerender(<LayerCompositing {...props} />);
  expect(group.dataset.reactRenders).toBe(initial);
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { opacity: 0.35 } }),
  );
  snapshot = d.engine.getSnapshot();
  view.rerender(<LayerCompositing {...props} page={snapshot.project.pages[0]!} />);
  expect(screen.getByRole("textbox", { name: "Opacité" })).toHaveValue("35");
  expect(Number(group.dataset.reactRenders)).toBeGreaterThan(Number(initial));
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } }),
  );
  snapshot = d.engine.getSnapshot();
  view.rerender(<LayerCompositing {...props} page={snapshot.project.pages[0]!} />);
  expect(screen.getByRole("textbox", { name: "Opacité" })).toBeDisabled();
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  expect(screen.getByRole("group", { name: "Layer compositing" })).toBe(group);
  await act(async () => {
    await i18n.changeLanguage("fr");
  });
  history.replaceState({}, "", "/");
});
test("resetting mixed opacity to its first value still restores every layer with one undo", () => {
  const d = fixture("mixed");
  act(() => {
    d.engine.load(d.engine.getSnapshot().project);
    d.engine.select([d.rectangle.id, d.text.id]);
  });
  const before = d.engine.getSnapshot();
  fireEvent.doubleClick(screen.getByRole("button", { name: "Ajuster Opacité" }));
  expect(
    d.engine
      .getSnapshot()
      .project.pages[0]!.layers.slice(0, 2)
      .map((layer) => layer.opacity),
  ).toEqual([1, 1]);
  const reset = d.engine.getSnapshot();
  fireEvent.doubleClick(screen.getByRole("button", { name: "Ajuster Opacité" }));
  expect(d.engine.getSnapshot()).toBe(reset);
  expect(d.store.get(previewAtom)).toBeNull();
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toEqual(before.project);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
test("mixed opacity and blend mode resolve atomically for all selected layers", async () => {
  const d = fixture("mixed");
  const input = screen.getByRole("textbox", { name: "Opacité" });
  expect(input).toHaveValue("");
  expect(input).toHaveAttribute("placeholder", "Mixte");
  expect(screen.getByRole("combobox", { name: "Fusion" })).toHaveTextContent("Mixte");
  const before = d.engine.getSnapshot();
  fireEvent.change(input, { target: { value: "55" } });
  expect(d.engine.getSnapshot()).toBe(before);
  expect(d.store.get(previewAtom)).toMatchObject({ patch: { opacity: 0.55 } });
  fireEvent.blur(input);
  expect(
    d.engine
      .getSnapshot()
      .project.pages[0]!.layers.slice(0, 2)
      .map((layer) => layer.opacity),
  ).toEqual([0.55, 0.55]);
  await choose("Fusion", "Superposition");
  expect(
    d.engine
      .getSnapshot()
      .project.pages[0]!.layers.slice(0, 2)
      .every((layer) => layer.blendMode === "screen"),
  ).toBe(true);
  act(() => d.engine.undo());
  expect(screen.getByRole("combobox", { name: "Fusion" })).toHaveTextContent("Mixte");
});
test("single-layer held scrubs preview imperatively and Escape restores the original opacity", () => {
  const d = fixture("single"),
    input = screen.getByRole("textbox", { name: "Opacité" });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(d.store.get(previewAtom)).toMatchObject({ patch: { opacity: 0.99 } });
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.keyDown(input, { key: "Escape" });
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

test("blend option hover and focus preview the whole selection, Escape cancels, and click commits once", async () => {
  const d = fixture("mixed");
  act(() => {
    const project = d.engine.getSnapshot().project;
    d.engine.load(project);
    d.engine.select([d.rectangle.id, d.text.id]);
  });
  const trigger = () => screen.getByRole("combobox", { name: "Fusion" });
  fireEvent.pointerDown(trigger(), { button: 0, ctrlKey: false, pointerType: "mouse" });
  const screenOption = await screen.findByRole("option", { name: "Superposition" });
  fireEvent.pointerMove(screenOption, { pointerType: "mouse" });
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "layers",
    layerIds: [d.rectangle.id, d.text.id],
    patch: { blendMode: "screen" },
  });
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  fireEvent.pointerDown(trigger(), { button: 0, ctrlKey: false, pointerType: "mouse" });
  const multiply = await screen.findByRole("option", { name: "Produit" });
  fireEvent.focus(multiply);
  expect(d.store.get(previewAtom)).toMatchObject({ patch: { blendMode: "multiply" } });
  fireEvent.click(multiply);
  expect(
    d.engine
      .getSnapshot()
      .project.pages[0]!.layers.slice(0, 2)
      .every((layer) => layer.blendMode === "multiply"),
  ).toBe(true);
  expect(d.store.get(previewAtom)).toBeNull();
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
