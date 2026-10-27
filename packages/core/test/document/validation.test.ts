import { describe, expect, it } from "vitest";
import { createEffect, createLayer, createPage, createProject } from "../../src/document/factories";
import type { Project } from "../../src/document/model";
import { validateProject } from "../../src/document/validation";

function fixture(): Project {
  const group = createLayer("group", { id: "group" });
  const image = createLayer("image", {
    id: "image",
    parentId: group.id,
    assetId: "asset",
    mask: { assetId: "asset", enabled: false, inverted: true },
    effects: [createEffect("ascii")],
  });
  return createProject({
    pages: [
      createPage({ layers: [group, image], guides: [{ id: "guide", axis: "x", position: 80 }] }),
    ],
    assets: {
      asset: {
        id: "asset",
        name: "Photo",
        mime: "image/png",
        width: 32,
        height: 32,
        dataUrl: "data:image/png;base64,AAAA",
      },
    },
  });
}
describe("untrusted document validation", () => {
  it("accepts complete documents with layers, masks, effects, assets and guides", () => {
    expect(() => validateProject(fixture())).not.toThrow();
    const project = fixture();
    project.pages[0]!.guides[0]!.axis = "y";
    expect(() => validateProject(project)).not.toThrow();
    for (const mime of ["jpeg", "webp", "gif", "svg+xml", "avif"]) {
      project.assets.asset!.mime = `image/${mime}`;
      project.assets.asset!.dataUrl = `data:image/${mime};base64,AAAA`;
      expect(() => validateProject(project)).not.toThrow();
    }
  });
  it.each([null, 1, [], {}, { version: 100 }])("rejects malformed roots %j", (value) => {
    expect(() => validateProject(value)).toThrow();
  });
  const invalid: Array<[string, (project: Project) => void]> = [
    [
      "duplicate ids",
      (p) => {
        p.pages[0]!.id = p.id;
      },
    ],
    [
      "empty name",
      (p) => {
        p.name = "";
      },
    ],
    [
      "invalid date",
      (p) => {
        p.createdAt = "never";
      },
    ],
    [
      "no page",
      (p) => {
        p.pages = [];
      },
    ],
    [
      "infinite width",
      (p) => {
        p.pages[0]!.width = Infinity;
      },
    ],
    [
      "negative height",
      (p) => {
        p.pages[0]!.height = -1;
      },
    ],
    [
      "excessive width",
      (p) => {
        p.pages[0]!.width = 20000;
      },
    ],
    [
      "invalid color",
      (p) => {
        p.pages[0]!.background = "url(evil)";
      },
    ],
    [
      "unknown kind",
      (p) => {
        p.pages[0]!.layers[0]!.kind = "unknown" as never;
      },
    ],
    [
      "invalid parent",
      (p) => {
        p.pages[0]!.layers[0]!.parentId = 3 as never;
      },
    ],
    [
      "missing parent",
      (p) => {
        p.pages[0]!.layers[1]!.parentId = "absent";
      },
    ],
    [
      "non-group parent",
      (p) => {
        p.pages[0]!.layers[0]!.kind = "rectangle";
      },
    ],
    [
      "self cycle",
      (p) => {
        p.pages[0]!.layers[0]!.parentId = "group";
      },
    ],
    [
      "invalid boolean",
      (p) => {
        p.pages[0]!.layers[0]!.visible = 1 as never;
      },
    ],
    [
      "unknown blend",
      (p) => {
        p.pages[0]!.layers[0]!.blendMode = "magic" as never;
      },
    ],
    [
      "invalid text",
      (p) => {
        p.pages[0]!.layers[0]!.text = null as never;
      },
    ],
    [
      "invalid align",
      (p) => {
        p.pages[0]!.layers[0]!.textAlign = "none" as never;
      },
    ],
    [
      "missing asset",
      (p) => {
        p.pages[0]!.layers[1]!.assetId = "missing";
      },
    ],
    [
      "image without source",
      (p) => {
        p.pages[0]!.layers[1]!.assetId = null;
      },
    ],
    [
      "mask missing source",
      (p) => {
        p.pages[0]!.layers[1]!.mask!.assetId = "missing";
      },
    ],
    [
      "effect unknown",
      (p) => {
        p.pages[0]!.layers[1]!.effects[0]!.type = "unknown" as never;
      },
    ],
    [
      "effect excessive amount",
      (p) => {
        p.pages[0]!.layers[1]!.effects[0]!.amount = 2;
      },
    ],
    [
      "bad guide axis",
      (p) => {
        p.pages[0]!.guides[0]!.axis = "z" as never;
      },
    ],
    [
      "invalid asset key",
      (p) => {
        p.assets.asset!.id = "other";
      },
    ],
    [
      "unsafe asset mime",
      (p) => {
        p.assets.asset!.mime = "text/html";
      },
    ],
    [
      "remote asset",
      (p) => {
        p.assets.asset!.dataUrl = "https://example.com/image.png";
      },
    ],
    [
      "invalid list",
      (p) => {
        p.pages[0]!.layers = {} as never;
      },
    ],
    [
      "invalid assets",
      (p) => {
        p.assets = [] as never;
      },
    ],
  ];
  it.each(invalid)("rejects %s", (_name, mutate) => {
    const project = fixture();
    mutate(project);
    expect(() => validateProject(project)).toThrow();
  });
  it("rejects excessive hierarchy depth and array sizes", () => {
    const project = createProject();
    const page = project.pages[0]!;
    for (let index = 0; index < 66; index += 1)
      page.layers.push(
        createLayer("group", {
          id: `group-${index}`,
          parentId: index === 0 ? null : `group-${index - 1}`,
        }),
      );
    expect(() => validateProject(project)).toThrow("profondeur");
    project.pages = Array.from({ length: 101 }, () => createPage());
    expect(() => validateProject(project)).toThrow("Liste");
  });
});
