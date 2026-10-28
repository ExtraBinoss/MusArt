import { expect, it, vi } from "vitest";
import { createEffect, createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { snapshotProject } from "../../../../src/services/projects/writes/snapshot";
it("isolates every mutable paint field before awaits and freezes nested arrays even under shallow-frozen roots", () => {
  const project = createProject({
    pages: [
      createPage({ layers: [createLayer("rectangle", { effects: [createEffect("blur")] })] }),
    ],
  });
  Object.freeze(project);
  const snapshot = snapshotProject(project);
  project.pages[0]!.layers[0]!.effects[0]!.amount = 0.8;
  expect(snapshot.pages[0]!.layers[0]!.effects[0]!.amount).not.toBe(0.8);
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot.pages[0]!.layers[0]!.effects[0])).toBe(true);
  expect(Object.isFrozen(snapshot.pages)).toBe(true);
  expect(snapshotProject(snapshot)).toBe(snapshot);
  expect(snapshotProject(project)).not.toBe(snapshot);
});

it("reuses only certified engine publications without cloning and keeps earlier captures immutable", () => {
  const layer = createLayer("rectangle", { x: 12 }),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
    before = engine.getSnapshot().project,
    clone = vi.spyOn(globalThis, "structuredClone");
  expect(snapshotProject(before)).toBe(before);
  expect(clone).not.toHaveBeenCalled();
  engine.execute({ type: "updateLayers", ids: [layer.id], patch: { x: 99 } });
  const after = engine.getSnapshot().project;
  expect(snapshotProject(after)).toBe(after);
  expect(after.pages[0]!.layers[0]!.x).toBe(99);
  expect(before.pages[0]!.layers[0]!.x).toBe(12);
  expect(clone).not.toHaveBeenCalled();
});

it("does not treat a deeply frozen external clone as an engine certificate", () => {
  const project = createProject({ pages: [createPage({ layers: [createLayer("text")] })] });
  function freeze(value: unknown) {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  }
  freeze(project);
  const capture = snapshotProject(project);
  expect(capture).not.toBe(project);
  expect(capture).toEqual(project);
});
