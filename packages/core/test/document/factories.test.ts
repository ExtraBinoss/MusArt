import { describe, expect, it } from "vitest";
import {
  createEffect,
  createId,
  createLayer,
  createPage,
  createProject,
  PRESETS,
} from "../../src/document/factories";
import { validateProject } from "../../src/document/validation";

describe("document factories", () => {
  it("creates independent layers with complete defaults and explicit overrides", () => {
    const first = createLayer("rectangle");
    const second = createLayer("text", { name: "Titre", fontSize: 120 });
    expect(first.id).not.toBe(second.id);
    expect(first.height).toBe(220);
    expect(second.height).toBe(100);
    expect(second).toMatchObject({ name: "Titre", fontSize: 120, text: "Votre texte" });
    first.effects.push(createEffect("dither"));
    expect(second.effects).toEqual([]);
    for (const kind of ["ellipse", "group", "image"] as const)
      expect(createLayer(kind).kind).toBe(kind);
  });
  it("defines deterministic effect defaults and meaningful correction midpoints", () => {
    expect(createEffect("dither")).toMatchObject({
      amount: 1,
      scale: 2,
      levels: 2,
      color: false,
      seed: 42,
    });
    expect(createEffect("ascii")).toMatchObject({ amount: 1, scale: 10, levels: 10, color: true });
    expect(createEffect("brightness").amount).toBe(0.5);
    expect(createEffect("contrast", { amount: 0.7 }).amount).toBe(0.7);
  });
  it("creates valid projects and presets without ambient timestamps", () => {
    const project = createProject();
    validateProject(project);
    expect(project.pages).toHaveLength(1);
    expect(project.createdAt).toBe("1970-01-01T00:00:00.000Z");
    expect(createPage({ name: "Poster", width: 600 }).name).toBe("Poster");
    expect(createProject({ name: "Édition" }).name).toBe("Édition");
    expect(new Set(PRESETS.map((preset) => preset.id)).size).toBe(PRESETS.length);
    expect(PRESETS.find((preset) => preset.id === "a4")).toMatchObject({
      width: 2480,
      height: 3508,
    });
    expect(createId()).toMatch(/^node-/);
    expect(createId("asset")).toMatch(/^asset-/);
  });
});
