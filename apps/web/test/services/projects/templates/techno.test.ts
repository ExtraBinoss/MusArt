import { expect, it } from "vitest";
import { createProject, EditorEngine, validateProject } from "@musart/core";
import {
  createTechnoArtboard,
  TECHNO_ARTBOARD_NAME,
} from "../../../../src/services/projects/templates/techno";
it("creates a complex editable artboard with deterministic IDs, analytical typography and GPU effect groups", () => {
  let sequence = 0;
  const page = createTechnoArtboard(() => `techno-${sequence++}`);
  expect(page.name).toBe(TECHNO_ARTBOARD_NAME);
  expect(page.layers.length).toBeGreaterThan(120);
  expect(page.layers.filter((layer) => layer.kind === "text").length).toBeGreaterThan(12);
  expect(page.layers.filter((layer) => layer.kind === "group")).toHaveLength(4);
  expect(page.layers.some((layer) => layer.fillGradient?.stops.length === 3)).toBe(true);
  expect(() => validateProject(createProject({ pages: [page] }))).not.toThrow();
  const engine = new EditorEngine(createProject()),
    before = engine.getSnapshot().project;
  engine.execute({ type: "addPage", page });
  expect(engine.getSnapshot().project.pages).toContainEqual(page);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  engine.redo();
  expect(engine.getSnapshot().project.pages.at(-1)?.name).toBe(TECHNO_ARTBOARD_NAME);
});
it("uses durable UUIDs by default instead of reusing a session-local allocator", () => {
  const first = createTechnoArtboard(),
    second = createTechnoArtboard();
  expect(first.id).not.toBe(second.id);
  expect(new Set([...first.layers, ...second.layers].map((layer) => layer.id)).size).toBe(
    first.layers.length + second.layers.length,
  );
});
