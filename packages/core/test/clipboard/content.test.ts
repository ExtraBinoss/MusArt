import { describe, expect, it } from "vitest";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EditorEngine,
} from "../../src/index";
import { copyContent, MAX_CLIPBOARD_CHARACTERS, parseClipboard } from "../../src/clipboard/content";

function fixture() {
  const source = createLayer("group", {
    id: "mask-group",
    x: 400,
    y: 300,
    width: 100,
    height: 100,
    maskSource: true,
  });
  const mask = createLayer("rectangle", {
    id: "mask-child",
    parentId: source.id,
    fill: "#ffffff",
    width: 50,
    height: 100,
  });
  const group = createLayer("group", {
    id: "group",
    x: 40,
    y: 70,
    width: 160,
    height: 120,
    effects: [createEffect("grain", { id: "grain" })],
  });
  const child = createLayer("image", {
    id: "image",
    parentId: group.id,
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    assetId: "asset",
    mask: { layerId: source.id, enabled: true, inverted: false, mode: "alpha" },
  });
  const unrelated = createLayer("rectangle", { id: "unrelated" });
  const asset = {
    id: "asset",
    name: "Photo",
    mime: "image/png",
    width: 100,
    height: 80,
    dataUrl: "data:image/png;base64,AAAA",
  };
  const page = createPage({
    id: "page",
    layers: [source, mask, group, child, unrelated],
    background: "#123456",
    guides: [{ id: "page-guide", axis: "x", position: 42 }],
  });
  const project = createProject({ id: "project", pages: [page], assets: { asset } });
  const engine = new EditorEngine(project);
  engine.select([child.id]);
  return { source, mask, group, child, unrelated, asset, page, project, engine };
}

describe("portable editable clipboard content", () => {
  it("copies an isolated subtree with processing ancestors, private complete mask dependencies and originals", () => {
    const d = fixture(),
      before = d.engine.getSnapshot();
    const text = copyContent(before);
    const content = parseClipboard(text, createProject());
    const page = content.document.pages[0]!;
    expect(content).toMatchObject({
      format: "musart.clipboard",
      version: 1,
      kind: "selection",
      selection: [d.child.id],
    });
    expect(page.layers.some((layer) => layer.id === d.unrelated.id)).toBe(false);
    expect(page.layers.find((layer) => layer.id === d.group.id)!.effects[0]!.type).toBe("grain");
    const child = page.layers.find((layer) => layer.id === d.child.id)!;
    const mask = page.layers.find((layer) => layer.id === child.mask!.layerId)!;
    expect(mask.maskSource).toBe(true);
    expect(page.layers.some((layer) => layer.parentId === mask.id)).toBe(true);
    expect(content.document.assets.asset).toEqual(d.asset);
    expect(page.background).toBe("transparent");
    expect(content.document.replay).toBeUndefined();
    expect(d.engine.getSnapshot()).toBe(before);
    expect(Object.isFrozen(before.project)).toBe(true);
  });
  it("coalesces parent/child selection and keeps asset masks while retaining only referenced originals", () => {
    const d = fixture();
    d.engine.execute({
      type: "updateLayers",
      ids: [d.child.id],
      patch: { mask: { assetId: d.asset.id, enabled: false, inverted: true, mode: "luminance" } },
    });
    d.engine.select([d.group.id, d.child.id]);
    const content = parseClipboard(copyContent(d.engine.getSnapshot()), d.project);
    expect(content.selection).toEqual([d.group.id]);
    expect(Object.keys(content.document.assets)).toEqual([d.asset.id]);
    expect(
      content.document.pages[0]!.layers.find((layer) => layer.id === d.child.id)!.mask,
    ).toMatchObject({ assetId: d.asset.id, enabled: false, inverted: true });
  });
  it("copies a full composition's layout and background independently of selection", () => {
    const d = fixture();
    d.engine.select([]);
    const content = parseClipboard(
      copyContent(d.engine.getSnapshot(), { composition: true }),
      createProject(),
    );
    expect(content.kind).toBe("composition");
    expect(content.selection).toEqual([]);
    expect(content.document.pages[0]).toEqual(d.page);
    expect(() => copyContent(d.engine.getSnapshot())).toThrow("selection is empty");
    const missing = { ...d.engine.getSnapshot(), pageId: "missing" };
    expect(() => copyContent(missing)).toThrow("composition is missing");
  });
  it("omits image bytes only with explicit permission and resolves matching local references", () => {
    const d = fixture(),
      text = copyContent(d.engine.getSnapshot(), { includeImages: false });
    expect(text).not.toContain(d.asset.dataUrl);
    const content = parseClipboard(text, d.project);
    expect(content.document.assets.asset).toEqual(d.asset);
    expect(content.references.asset!.fingerprint).toMatch(/^\d+:\d+:\d+$/);
    expect(() => parseClipboard(text, createProject())).toThrow("originals are missing");
    expect(() => parseClipboard(text, { ...d.project, assets: {} })).toThrow(
      "originals are missing",
    );
    for (const patch of [
      { name: "Changed" },
      { width: 50 },
      { dataUrl: "data:image/png;base64,BBBB" },
    ])
      expect(() =>
        parseClipboard(text, { ...d.project, assets: { asset: { ...d.asset, ...patch } } }),
      ).toThrow("originals are missing");
    const duplicate = JSON.parse(text);
    duplicate.document.assets = d.project.assets;
    expect(() => parseClipboard(JSON.stringify(duplicate), d.project)).toThrow(
      "originals are missing",
    );
  });
  it("rejects unsupported, malformed, oversized and cyclic or invalid resource graphs", () => {
    const d = fixture(),
      valid = JSON.parse(copyContent(d.engine.getSnapshot()));
    for (const patch of [
      null,
      [],
      {},
      { ...valid, format: "other" },
      { ...valid, version: 2 },
      { ...valid, kind: "other" },
      { ...valid, references: [] },
      { ...valid, selection: [42] },
      { ...valid, selection: [] },
      { ...valid, selection: [d.child.id, d.child.id] },
      { ...valid, selection: ["missing"] },
    ])
      expect(() => parseClipboard(JSON.stringify(patch), d.project)).toThrow();
    const cycle = structuredClone(valid);
    cycle.document.pages[0].layers.find(
      (layer: { id: string }) => layer.id === d.group.id,
    ).parentId = d.group.id;
    expect(() => parseClipboard(JSON.stringify(cycle), d.project)).toThrow();
    const foreign = structuredClone(valid);
    foreign.sourceProjectId = "other";
    expect(() => parseClipboard(JSON.stringify(foreign), d.project)).toThrow("scope");
    const multiple = structuredClone(valid);
    multiple.document.pages.push(createPage({ id: "another" }));
    expect(() => parseClipboard(JSON.stringify(multiple), d.project)).toThrow("scope");
    expect(() => parseClipboard("not json", d.project)).toThrow();
    expect(() => parseClipboard(" ".repeat(MAX_CLIPBOARD_CHARACTERS + 1), d.project)).toThrow(
      "too large",
    );
    const enormous = {
      ...d.engine.getSnapshot(),
      project: {
        ...d.project,
        assets: {
          asset: {
            ...d.asset,
            dataUrl: `data:image/png;base64,${"A".repeat(MAX_CLIPBOARD_CHARACTERS)}`,
          },
        },
      },
    };
    expect(() => copyContent(enormous)).toThrow("too large");
  });
});
