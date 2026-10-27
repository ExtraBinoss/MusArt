import { describe, expect, it, vi } from "vitest";
import { createEffect, createLayer, createPage, createProject } from "../../src/document/factories";
import { createId, reserveProjectIds } from "../../src/document/identity";

describe("portable identity allocation", () => {
  it("does not collide with reserved IDs of projects, pages, assets, layers, guides or effects", () => {
    const project = createProject({
      pages: [
        createPage({
          layers: [createLayer("rectangle", { effects: [createEffect("dither")] })],
          guides: [{ id: "guide", axis: "x", position: 10 }],
        }),
      ],
      assets: {
        asset: {
          id: "asset",
          name: "Pixel",
          mime: "image/png",
          width: 1,
          height: 1,
          dataUrl: "data:image/png;base64,AAAA",
        },
      },
    });
    const targets: Array<(id: string) => void> = [
      (id) => {
        project.id = id;
      },
      (id) => {
        project.pages[0]!.id = id;
      },
      (id) => {
        project.assets.asset!.id = id;
      },
      (id) => {
        project.pages[0]!.layers[0]!.id = id;
      },
      (id) => {
        project.pages[0]!.guides[0]!.id = id;
      },
      (id) => {
        project.pages[0]!.layers[0]!.effects[0]!.id = id;
      },
    ];
    for (const target of targets) {
      const checkpoint = createId("checkpoint");
      const suffix = Number.parseInt(checkpoint.split("-").at(-1)!, 36) + 1;
      const collision = `external-${suffix.toString(36)}`;
      target(collision);
      reserveProjectIds(project);
      expect(createId("external")).not.toBe(collision);
    }
    expect(createId()).toMatch(/^node-/);
  });
  it("reserves old identifiers after a fresh module session and repeated document loading", async () => {
    vi.resetModules();
    const first = await import("../../src/index");
    const layer = first.createLayer("rectangle");
    const page = first.createPage({ layers: [layer] });
    const oldProject = first.createProject({ pages: [page] });
    const serialized = first.serializeProject(oldProject);
    vi.resetModules();
    const second = await import("../../src/index");
    const loaded = second.parseProject(serialized);
    const engine = new second.EditorEngine(loaded);
    const fresh = second.createLayer("rectangle");
    engine.execute({ type: "addLayers", layers: [fresh] });
    expect(fresh.id).not.toBe(layer.id);
    const ids = engine.getSnapshot().project.pages[0]!.layers.map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
    engine.load(loaded);
    const freshPage = second.createPage();
    engine.execute({ type: "addPage", page: freshPage });
    expect(freshPage.id).not.toBe(page.id);
  });
});
