import { expect, test } from "vitest";
import { createEffect, createLayer, createPage, createProject } from "../../src/document/factories";
import { selectionComposition } from "../../src/export/selection";
import { validateProject } from "../../src/document/validation";
import { getWorldBounds } from "../../src/layers/geometry";

test("isolates and crops transformed selections without siblings, preserving ancestor processing", () => {
  const group = createLayer("group", {
    id: "g",
    x: 100,
    y: 80,
    width: 300,
    height: 300,
    rotation: 90,
    opacity: 0.5,
  });
  const child = createLayer("rectangle", {
    id: "c",
    parentId: "g",
    x: 20,
    y: 30,
    width: 100,
    height: 60,
  });
  const sibling = createLayer("rectangle", { id: "s", parentId: "g" });
  const page = createPage({ layers: [group, child, sibling] });
  const before = structuredClone(page);
  const result = selectionComposition(page, ["c"]);
  expect(result.layers.map((layer) => layer.id)).toEqual(["g", "c"]);
  expect(result).toMatchObject({
    width: 60,
    height: 100,
    background: "transparent",
    guides: [],
    rulers: false,
  });
  expect(result.layers[0]!.opacity).toBe(0.5);
  const bounds = getWorldBounds(result, "c");
  expect(bounds.x).toBeCloseTo(0, 10);
  expect(bounds.y).toBeCloseTo(0, 10);
  expect(bounds.width).toBeCloseTo(60, 10);
  expect(bounds.height).toBeCloseTo(100, 10);
  expect(page).toEqual(before);
  validateProject(createProject({ pages: [result] }));
});
test("selected groups keep all descendants; duplicate selected descendants do not expand the crop", () => {
  const group = createLayer("group", { id: "g", x: 5.2, y: 10.4, width: 100, height: 80 });
  const child = createLayer("rectangle", { id: "c", parentId: "g", x: -30, width: 20 });
  const result = selectionComposition(createPage({ layers: [group, child] }), ["g", "c", "g"]);
  expect(result.layers).toHaveLength(2);
  expect([result.width, result.height]).toEqual([101, 81]);
  expect(result.layers[0]!.x).toBeCloseTo(0.2);
  expect(result.layers[0]!.y).toBeCloseTo(0.4);
});
test("preserves cross-group mask dependencies and chained masks without unrelated siblings", () => {
  const page = createPage({
    layers: [
      createLayer("rectangle", {
        id: "target",
        x: 30,
        y: 40,
        width: 60,
        height: 50,
        mask: { layerId: "mask", enabled: true, inverted: false },
      }),
      createLayer("group", { id: "mg", x: 10, y: 20 }),
      createLayer("group", {
        id: "mask",
        parentId: "mg",
        mask: { layerId: "inner", enabled: true, inverted: false },
      }),
      createLayer("rectangle", { id: "mask-child", parentId: "mask" }),
      createLayer("rectangle", { id: "inner" }),
      createLayer("rectangle", { id: "other", parentId: "mg" }),
    ],
  });
  const result = selectionComposition(page, ["target"]);
  const target = result.layers.find((layer) => layer.id === "target")!;
  const mask = result.layers.find((layer) => layer.id === target.mask!.layerId)!;
  const ancestor = result.layers.find((layer) => layer.id === mask.parentId)!;
  const inner = result.layers.find((layer) => layer.id === mask.mask!.layerId)!;
  expect(result.layers).toHaveLength(5);
  expect(result.layers.at(-1)!.id).toBe("target");
  expect([result.width, result.height]).toEqual([60, 50]);
  expect(ancestor.maskSource).toBe(true);
  expect(inner.maskSource).toBe(true);
  expect(result.layers.find((layer) => layer.parentId === mask.id)!.maskSource).toBeUndefined();
  expect(
    result.layers.some((layer) =>
      ["mg", "mask", "mask-child", "inner", "other"].includes(layer.id),
    ),
  ).toBe(false);
  validateProject(createProject({ pages: [result] }));
  const overlap = selectionComposition(page, ["target", "mask-child"]);
  expect(
    overlap.layers.filter((layer) => ["target", "mg", "mask", "mask-child"].includes(layer.id)),
  ).toHaveLength(4);
  const paintedMask = overlap.layers.find((layer) => layer.id === "mask")!;
  expect(paintedMask.mask!.layerId).not.toBe("inner");
  expect(overlap.layers.find((layer) => layer.id === "target")!.mask!.layerId).not.toBe(
    paintedMask.id,
  );
  validateProject(createProject({ pages: [overlap] }));
});
test("unions independent selections and rejects empty or stale selection IDs", () => {
  const page = createPage({
    layers: [
      createLayer("rectangle", { id: "a", x: -20, y: 10, width: 10, height: 20 }),
      createLayer("rectangle", { id: "b", x: 40, y: 50, width: 30, height: 40 }),
    ],
  });
  expect(selectionComposition(page, ["a", "b"])).toMatchObject({ width: 90, height: 80 });
  expect(() => selectionComposition(page, [])).toThrow("empty");
  expect(() => selectionComposition(page, ["missing"])).toThrow("missing");
});
test("isolates ten thousand selected elements without per-element document indexing", () => {
  const layers = Array.from({ length: 10000 }, (_, index) =>
    createLayer("rectangle", { id: `r${index}`, x: index, y: 0, width: 1, height: 1 }),
  );
  const result = selectionComposition(
    createPage({ width: 10000, height: 100, layers }),
    layers.map((layer) => layer.id),
  );
  expect(result.layers).toHaveLength(10000);
  expect([result.width, result.height]).toEqual([10000, 1]);
});
test("exports an explicitly selected mask source without exposing unselected attached mask children", () => {
  const group = createLayer("group", {
    id: "g",
    maskSource: true,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  const child = createLayer("rectangle", { id: "c", parentId: "g", maskSource: true });
  const result = selectionComposition(createPage({ layers: [group, child] }), ["g"]);
  expect(result.layers[0]!.maskSource).toBe(false);
  expect(result.layers[1]!.maskSource).toBe(true);
});

test("a partial painted mask source cannot remove its unselected sibling from the target's private mask", () => {
  const group = createLayer("group", {
    id: "mask-group",
    name: "Mask group",
    x: 50,
    y: 70,
    width: 200,
    height: 100,
    rotation: 25,
    opacity: 0.6,
    maskSource: true,
  });
  const first = createLayer("rectangle", {
    id: "left",
    parentId: group.id,
    name: "Left",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  const second = createLayer("rectangle", {
    id: "right",
    parentId: group.id,
    name: "Right",
    x: 100,
    y: 0,
    width: 100,
    height: 100,
  });
  const target = createLayer("rectangle", {
    id: "target",
    name: "Target",
    x: 20,
    y: 30,
    width: 400,
    height: 300,
    mask: { layerId: group.id, enabled: true, inverted: false },
  });
  const page = createPage({ layers: [group, first, second, target] }),
    before = structuredClone(page);
  const result = selectionComposition(page, [target.id, first.id]);
  const painted = result.layers.filter((layer) =>
    [group.id, first.id, target.id].includes(layer.id),
  );
  expect(painted.map((layer) => layer.id)).toEqual([group.id, first.id, target.id]);
  expect(result.layers.some((layer) => layer.id === second.id)).toBe(false);
  const targetCopy = result.layers.find((layer) => layer.id === target.id)!;
  const maskCopy = result.layers.find((layer) => layer.id === targetCopy.mask!.layerId)!;
  const children = result.layers.filter((layer) => layer.parentId === maskCopy.id);
  expect(maskCopy.id).not.toBe(group.id);
  expect(maskCopy.maskSource).toBe(true);
  expect(children.map((layer) => layer.name)).toEqual(["Left", "Right"]);
  expect(children.every((layer) => layer.visible && !layer.maskSource)).toBe(true);
  expect(children.map((layer) => layer.x)).toEqual([0, 100]);
  expect(result.layers.find((layer) => layer.id === group.id)!.maskSource).toBe(false);
  const originalBounds = getWorldBounds(page, first.id),
    copyBounds = getWorldBounds(result, children[0]!.id),
    paintedBounds = getWorldBounds(result, first.id);
  expect(copyBounds).toEqual(paintedBounds);
  expect(copyBounds.width).toBeCloseTo(originalBounds.width);
  expect(copyBounds.height).toBeCloseTo(originalBounds.height);
  expect(page).toEqual(before);
  validateProject(createProject({ pages: [result] }));
  const full = selectionComposition(page, [target.id, group.id]);
  expect(
    full.layers.filter((layer) => [group.id, first.id, second.id, target.id].includes(layer.id)),
  ).toHaveLength(4);
  expect(full.layers.find((layer) => layer.id === target.id)!.mask!.layerId).not.toBe(group.id);
  validateProject(createProject({ pages: [full] }));
});

test("dependency effects and guides get deterministic private IDs disjoint from the entire caller scope", () => {
  const effect = createEffect("blur", { id: "source-effect" }),
    guide = { id: "source-guide", axis: "x" as const, position: 10 };
  const source = createLayer("rectangle", {
    id: "source",
    effects: [effect],
    guides: [guide],
    assetId: "original-asset",
  });
  const target = createLayer("rectangle", {
    id: "target",
    mask: { layerId: source.id, enabled: true, inverted: false },
  });
  const page = createPage({ layers: [source, target] });
  const reserved = [
    "__musart_export_mask_1",
    "__musart_export_mask_2",
    "other-page",
    "other-project",
    "original-asset",
  ];
  const result = selectionComposition(page, [target.id, source.id], reserved),
    again = selectionComposition(page, [source.id, target.id], reserved);
  expect(result).toEqual(again);
  const targetCopy = result.layers.find((layer) => layer.id === target.id)!,
    sourceCopy = result.layers.find((layer) => layer.id === targetCopy.mask!.layerId)!;
  expect(sourceCopy.id).not.toBe(source.id);
  expect(sourceCopy.effects[0]!.id).not.toBe(effect.id);
  expect(sourceCopy.guides![0]!.id).not.toBe(guide.id);
  expect(sourceCopy.assetId).toBe("original-asset");
  const ids = result.layers.flatMap((layer) => [
    layer.id,
    ...layer.effects.map((item) => item.id),
    ...(layer.guides ?? []).map((item) => item.id),
  ]);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.every((id) => !reserved.includes(id))).toBe(true);
  expect(sourceCopy.effects[0]).toMatchObject({ ...effect, id: expect.any(String) });
  expect(sourceCopy.guides![0]).toMatchObject({ ...guide, id: expect.any(String) });
  expect(source.effects).toEqual([effect]);
  expect(source.guides).toEqual([guide]);
});

test("ancestor masks expand their own complete dependency closure and preserve original local transforms", () => {
  const ancestor = createLayer("group", {
    id: "ancestor",
    x: 100,
    y: 80,
    rotation: 45,
    opacity: 0.8,
    mask: { layerId: "ancestor-mask", enabled: true, inverted: false },
  });
  const source = createLayer("group", {
    id: "source",
    parentId: ancestor.id,
    x: 20,
    y: 30,
    width: 100,
    height: 100,
    mask: { layerId: "source-mask", enabled: false, inverted: true },
  });
  const content = createLayer("rectangle", { id: "content", parentId: source.id, x: 5, y: 7 });
  const ancestorMask = createLayer("rectangle", {
    id: "ancestor-mask",
    x: 60,
    y: 70,
    opacity: 0.5,
  });
  const sourceMask = createLayer("rectangle", { id: "source-mask", x: 10, y: 15 });
  const target = createLayer("rectangle", {
    id: "target",
    x: 30,
    y: 20,
    width: 80,
    height: 90,
    mask: { layerId: source.id, enabled: true, inverted: false },
  });
  const page = createPage({
      layers: [ancestor, source, content, ancestorMask, sourceMask, target],
    }),
    result = selectionComposition(page, [target.id]);
  expect(result.layers).toHaveLength(6);
  const targetCopy = result.layers.find((layer) => layer.id === target.id)!,
    sourceCopy = result.layers.find((layer) => layer.id === targetCopy.mask!.layerId)!,
    ancestorCopy = result.layers.find((layer) => layer.id === sourceCopy.parentId)!;
  expect([sourceCopy.x, sourceCopy.y, sourceCopy.opacity]).toEqual([
    source.x,
    source.y,
    source.opacity,
  ]);
  expect([ancestorCopy.x, ancestorCopy.y, ancestorCopy.rotation, ancestorCopy.opacity]).toEqual([
    70, 60, 45, 0.8,
  ]);
  expect(ancestorCopy.mask!.layerId).not.toBe(ancestorMask.id);
  expect(sourceCopy.mask).toMatchObject({ enabled: false, inverted: true });
  expect(sourceCopy.mask!.layerId).not.toBe(sourceMask.id);
  expect(
    result.layers
      .filter((layer) => layer.parentId === null)
      .every((layer) => layer.id === target.id || layer.maskSource === true),
  ).toBe(true);
  validateProject(createProject({ pages: [result] }));
});

test("explicit children reveal their mask-source ancestor path, while unselected attached descendants retain their flags", () => {
  const group = createLayer("group", { id: "g", maskSource: true, x: 10, y: 20 }),
    child = createLayer("rectangle", { id: "c", parentId: group.id, maskSource: false }),
    attached = createLayer("rectangle", { id: "attached", parentId: group.id, maskSource: true });
  const result = selectionComposition(createPage({ layers: [group, child, attached] }), [child.id]);
  expect(result.layers.map((layer) => layer.id)).toEqual([group.id, child.id]);
  expect(result.layers[0]!.maskSource).toBe(false);
  const full = selectionComposition(createPage({ layers: [group, child, attached] }), [group.id]);
  expect(full.layers[2]!.maskSource).toBe(true);
});

test("asset masks do not clone sources or inspect unrelated reserved IDs", () => {
  const target = createLayer("rectangle", {
    mask: { assetId: "mask-image", enabled: true, inverted: false },
  });
  const untouched = {
    [Symbol.iterator](): Iterator<string> {
      throw Error("no layer-mask copies are needed");
    },
  };
  const result = selectionComposition(createPage({ layers: [target] }), [target.id], untouched);
  expect(result.layers).toHaveLength(1);
  expect(result.layers[0]!.mask).toBe(target.mask);
});

test("ten thousand overlapping painted layers and private mask copies remain unique and ordered", () => {
  const layers = Array.from({ length: 10000 }, (_, index) =>
    createLayer("rectangle", {
      id: `large-${index}`,
      x: index,
      y: 0,
      width: 1,
      height: 1,
      ...(index % 2
        ? { mask: { layerId: `large-${index - 1}`, enabled: true, inverted: false } }
        : { maskSource: true }),
    }),
  );
  const result = selectionComposition(
    createPage({ layers, width: 10000, height: 100 }),
    layers.map((layer) => layer.id),
  );
  expect(result.layers).toHaveLength(15000);
  expect(result.layers.slice(5000).map((layer) => layer.id)).toEqual(
    layers.map((layer) => layer.id),
  );
  expect(new Set(result.layers.map((layer) => layer.id)).size).toBe(15000);
  expect(result.layers.slice(0, 5000).every((layer) => layer.maskSource)).toBe(true);
  const byId = new Map(result.layers.map((layer) => [layer.id, layer]));
  for (let index = 1; index < 10000; index += 2) {
    const target = byId.get(`large-${index}`)!;
    expect(target.mask!.layerId).not.toBe(`large-${index - 1}`);
    expect(byId.get(target.mask!.layerId!)!.x).toBe(index - 1);
  }
  expect([result.width, result.height]).toEqual([10000, 1]);
});
test("missing source references report a real dependency error", () => {
  const layer = createLayer("rectangle", {
    mask: { layerId: "missing", enabled: true, inverted: false },
  });
  expect(() => selectionComposition(createPage({ layers: [layer] }), [layer.id])).toThrow(
    "Export mask source is missing",
  );
});
