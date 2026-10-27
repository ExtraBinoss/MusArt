import { expect, it, vi } from "vitest";
import { EditorEngine, validateProject } from "@musart/core";
import { createDemoProject } from "../../../src/services/projects/demo";
it("creates an editable portable example using original embedded artwork and local typography", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"));
  const project = createDemoProject();
  validateProject(project);
  const engine = new EditorEngine(project);
  expect(project.createdAt).toBe("2026-10-27T12:00:00.000Z");
  expect(project.updatedAt).toBe(project.createdAt);
  expect(project.pages).toHaveLength(2);
  expect(project.pages[0]).toMatchObject({ width: 1080, height: 1350, background: "#f1eee7" });
  const image = project.pages[0]!.layers.find((layer) => layer.kind === "image")!;
  const svg = atob(project.assets[image.assetId!]!.dataUrl.split(",")[1]!);
  expect(
    new DOMParser().parseFromString(svg, "image/svg+xml").querySelectorAll("circle"),
  ).toHaveLength(2);
  const title = project.pages[0]!.layers.find((layer) => layer.name === "Titre")!;
  engine.execute({ type: "updateLayers", ids: [title.id], patch: { text: "Mon affiche" } });
  expect(
    engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === title.id)?.text,
  ).toBe("Mon affiche");
  vi.useRealTimers();
});
