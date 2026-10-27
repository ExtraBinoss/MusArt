import { describe, expect, it } from "vitest";
import { createEffect, createLayer, createPage, createProject } from "../../src/document/factories";
import { parseProject, serializeProject } from "../../src/document/serialization";

describe("portable serialization", () => {
  it("round-trips nested layers, assets, effects, masks and multiple pages", () => {
    const group = createLayer("group");
    const image = createLayer("image", {
      parentId: group.id,
      assetId: "asset",
      mask: { assetId: "asset", enabled: true, inverted: false },
      effects: [createEffect("dither")],
    });
    const project = createProject({
      pages: [createPage({ layers: [group, image] }), createPage()],
      assets: {
        asset: {
          id: "asset",
          name: "pixel",
          mime: "image/png",
          width: 1,
          height: 1,
          dataUrl: "data:image/png;base64,AA==",
        },
      },
    });
    const json = serializeProject(project);
    expect(parseProject(json)).toEqual(project);
    expect(serializeProject(parseProject(json))).toBe(json);
    const result = parseProject(json);
    result.pages[0]!.layers[0]!.name = "Changed";
    expect(project.pages[0]!.layers[0]!.name).toBe("Groupe");
  });
  it("rejects corrupted JSON and unsupported schemas rather than guessing migrations", () => {
    expect(() => parseProject("{")).toThrow("JSON valide");
    expect(() => parseProject({ length: 250_000_001 } as never)).toThrow("volumineux");
    expect(() => parseProject('{"version":0}')).toThrow("Version");
    expect(() => serializeProject({} as never)).toThrow();
  });
});
