import { expect, test } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { LayerCompositing } from "../../../../src/components/layers/controls/LayerCompositing";
import { useEngine, previewAtom } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";
import { choose } from "../../../support/select";
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
