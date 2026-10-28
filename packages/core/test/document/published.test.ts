import { expect, test } from "vitest";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { EditorEngine } from "../../src/session/engine";
import {
  isPublishedAssets,
  isPublishedComposition,
  isPublishedProject,
} from "../../src/document/published";

test("certifies only validated deeply frozen engine publications, without portable markers", () => {
  const input = createProject({
    pages: [createPage({ layers: [createLayer("rectangle", { id: "r" })] })],
  });
  expect(isPublishedProject(input)).toBe(false);
  expect(isPublishedAssets(input.assets)).toBe(false);
  expect(isPublishedComposition(input.pages[0]!)).toBe(false);
  Object.freeze(input);
  expect(isPublishedProject(input)).toBe(false);
  const engine = new EditorEngine(input),
    before = engine.getSnapshot().project;
  expect(isPublishedProject(before)).toBe(true);
  expect(isPublishedAssets(before.assets)).toBe(true);
  expect(isPublishedAssets(Object.freeze(structuredClone(before.assets)))).toBe(false);
  expect(isPublishedComposition(before.pages[0]!)).toBe(true);
  expect(isPublishedComposition(structuredClone(before.pages[0]!))).toBe(false);
  expect(isPublishedProject(structuredClone(before))).toBe(false);
  expect(Object.keys(before)).toEqual(Object.keys(input));
  expect(Object.isFrozen(before.pages[0]!.layers[0]!.effects)).toBe(true);
  expect(() =>
    engine.execute({ type: "updateLayers", ids: ["r"], patch: { opacity: 2 } }),
  ).toThrow();
  expect(engine.getSnapshot().project).toBe(before);
  engine.execute({ type: "updateLayers", ids: ["r"], patch: { x: 12 } });
  expect(isPublishedProject(engine.getSnapshot().project)).toBe(true);
  expect(isPublishedComposition(engine.getSnapshot().project.pages[0]!)).toBe(true);
  engine.undo();
  expect(isPublishedProject(engine.getSnapshot().project)).toBe(true);
  engine.redo();
  expect(isPublishedProject(engine.getSnapshot().project)).toBe(true);
  const loaded = createProject();
  engine.load(loaded);
  expect(isPublishedProject(loaded)).toBe(false);
  expect(isPublishedProject(engine.getSnapshot().project)).toBe(true);
});

test("certifies the exact captured DTO rather than validating a different getter result", () => {
  const input = createProject();
  let reads = 0;
  Object.defineProperty(input, "name", {
    enumerable: true,
    get: () => (++reads === 1 ? "Captured once" : 42),
  });
  const engine = new EditorEngine(input);
  expect(reads).toBe(1);
  expect(engine.getSnapshot().project.name).toBe("Captured once");
  expect(isPublishedProject(engine.getSnapshot().project)).toBe(true);

  const next = createProject();
  let loadReads = 0;
  Object.defineProperty(next, "name", {
    enumerable: true,
    get: () => (++loadReads === 1 ? "Loaded once" : null),
  });
  engine.load(next);
  expect(loadReads).toBe(1);
  expect(engine.getSnapshot().project.name).toBe("Loaded once");
  const before = engine.getSnapshot(),
    invalid = createProject();
  Object.defineProperty(invalid, "name", { enumerable: true, get: () => 42 });
  expect(() => engine.load(invalid)).toThrow();
  expect(engine.getSnapshot()).toBe(before);
  expect(isPublishedProject(invalid)).toBe(false);
});
