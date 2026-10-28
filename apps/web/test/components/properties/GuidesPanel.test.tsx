import { expect, test } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { previewAtom } from "../../../src/state/session/editor";
import { GuidesPanel } from "../../../src/components/properties/GuidesPanel";
import { useEngine } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
test("manages page guides and rulers through undoable commands", () => {
  const d = setup();
  function Live() {
    const s = useEngine(d.engine);
    return <GuidesPanel engine={d.engine} page={s.project.pages[0]!} run={d.run} />;
  }
  d.mount(<Live />);
  expect(screen.getByLabelText("Afficher les règles")).not.toBeChecked();
  fireEvent.click(screen.getByLabelText("Afficher les règles"));
  expect(d.engine.getSnapshot().project.pages[0]!.rulers).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Ajouter un repère vertical" }));
  fireEvent.click(screen.getByRole("button", { name: "Ajouter un repère horizontal" }));
  expect(d.engine.getSnapshot().project.pages[0]!.guides).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Repère vertical X"), { target: { value: "200" } });
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "page",
    patch: {
      guides: expect.arrayContaining([expect.objectContaining({ axis: "x", position: 200 })]),
    },
  });
  expect(d.engine.getSnapshot().project.pages[0]!.guides[0]!.position).toBe(540);
  fireEvent.blur(screen.getByLabelText("Repère vertical X"));
  expect(d.engine.getSnapshot().project.pages[0]!.guides[0]!.position).toBe(200);
  fireEvent.click(screen.getAllByLabelText("Supprimer le repère")[0]!);
  expect(d.engine.getSnapshot().project.pages[0]!.guides).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Effacer les repères" }));
  expect(d.engine.getSnapshot().project.pages[0]!.guides).toHaveLength(0);
});
test("keeps selected-layer guides separate from composition guides", () => {
  const d = setup();
  d.engine.execute({ type: "addGuide", guide: { id: "page-guide", axis: "x", position: 80 } });
  function Live() {
    const s = useEngine(d.engine),
      page = s.project.pages[0]!;
    return <GuidesPanel engine={d.engine} page={page} layer={page.layers[0]!} run={d.run} />;
  }
  d.mount(<Live />);
  expect(screen.queryByLabelText("Repère vertical X")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Ajouter un repère vertical" }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.guides).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Repère vertical X"), { target: { value: "125" } });
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "layer",
    layerId: d.rectangle.id,
    patch: { guides: [expect.objectContaining({ position: 125 })] },
  });
  fireEvent.keyDown(screen.getByLabelText("Repère vertical X"), { key: "Escape" });
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project.pages[0]!.guides).toEqual([
    { id: "page-guide", axis: "x", position: 80 },
  ]);
  expect(screen.queryByLabelText("Afficher les règles")).toBeNull();
});
