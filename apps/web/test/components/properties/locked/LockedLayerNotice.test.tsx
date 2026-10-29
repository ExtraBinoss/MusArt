import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { createLayer, createPage, createProject } from "@musart/core";
import { LockedLayerNotice } from "../../../../src/components/properties/locked/LockedLayerNotice";
import { previewAtom, useEngine } from "../../../../src/state/session/editor";
import { setup } from "../../../support/ui";

test("names blocking groups, unlocks real ancestors and clears an owned preview with one undo", () => {
  const d = setup();
  d.engine.load(
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("group", { id: "parent", name: "Protected group", locked: true }),
            createLayer("rectangle", { id: "leaf", parentId: "parent" }),
          ],
        }),
      ],
    }),
  );
  d.engine.select(["leaf"]);
  function Live() {
    const current = useEngine(d.engine),
      page = current.project.pages[0]!;
    return (
      <LockedLayerNotice
        engine={d.engine}
        page={page}
        layers={page.layers.filter((layer) => current.selection.includes(layer.id))}
        run={d.run}
      />
    );
  }
  d.mount(<Live />);
  expect(screen.getByRole("status")).toHaveTextContent("Ce calque est verrouillé");
  expect(screen.getByRole("status")).toHaveTextContent("Protected group");
  d.store.set(previewAtom, { target: "layer", layerId: "leaf", patch: { x: 99 } });
  fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(d.store.get(previewAtom)).toBeNull();
  expect(d.engine.getSnapshot().project.pages[0]!.layers[1]!.x).not.toBe(99);
  act(() => d.engine.undo());
  expect(screen.getByRole("status")).toBeVisible();
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});
test("multiselection notice refuses an unlock deferred past a selection change", () => {
  const d = setup();
  d.engine.execute({
    type: "updateLayers",
    ids: [d.rectangle.id, d.text.id],
    patch: { locked: true },
  });
  d.engine.select([d.rectangle.id, d.text.id]);
  const page = d.engine.getSnapshot().project.pages[0]!,
    tasks: (() => void)[] = [];
  const run = vi.fn((task: () => void) => tasks.push(task));
  d.mount(
    <LockedLayerNotice engine={d.engine} page={page} layers={page.layers.slice(0, 2)} run={run} />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("Des calques sélectionnés sont verrouillés");
  fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
  d.engine.select([d.image.id]);
  const before = d.engine.getSnapshot();
  act(() => tasks[0]!());
  expect(d.engine.getSnapshot()).toBe(before);
});

test("an unchanged retained notice resolves ruler metadata when clicked and guards its queued action", () => {
  const d = setup();
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } });
  d.engine.select([d.rectangle.id]);
  const page = d.engine.getSnapshot().project.pages[0]!;
  const tasks: (() => void)[] = [];
  d.mount(
    <LockedLayerNotice
      engine={d.engine}
      page={page}
      layers={[page.layers[0]!]}
      run={(task) => tasks.push(task)}
    />,
  );
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: true } }));
  fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: false } }));
  const stale = d.engine.getSnapshot();
  act(() => tasks.shift()!());
  expect(d.engine.getSnapshot()).toBe(stale);
  fireEvent.click(screen.getByRole("button", { name: "Déverrouiller" }));
  act(() => tasks.shift()!());
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.locked).toBe(false);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.locked).toBe(true);
});
