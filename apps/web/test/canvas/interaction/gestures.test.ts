import { describe, expect, it } from "vitest";
import { createLayer, createPage, getWorldMatrix, transformPoint } from "@musart/core";
import {
  applyPreview,
  boxSelection,
  clickSelection,
  movePatches,
  patchesToCommands,
  resizePatch,
  selectedRoots,
} from "../../../src/canvas/interaction/gestures";
describe("transient canvas gestures", () => {
  it("moves selection roots once and excludes inherited locks", () => {
    const group = createLayer("group");
    const child = createLayer("rectangle", { parentId: group.id });
    const locked = createLayer("group", { locked: true });
    const lockedChild = createLayer("rectangle", { parentId: locked.id });
    const page = createPage({ layers: [group, child, locked, lockedChild] });
    expect(selectedRoots(page, [group.id, child.id, locked.id, lockedChild.id])).toEqual([group]);
    expect(selectedRoots(page, [child.id])).toEqual([child]);
  });
  it("maps world movement through rotated parent coordinates", () => {
    const group = createLayer("group", { rotation: 90 });
    const child = createLayer("rectangle", { parentId: group.id, x: 10, y: 20 });
    const page = createPage({ layers: [group, child] });
    const result = movePatches(page, [child], { x: 0, y: 0 }, { x: 10, y: 20 }, false, 6)[0]!;
    expect(result.patch.x).toBeCloseTo(30);
    expect(result.patch.y).toBeCloseTo(10);
  });
  it("snaps to page edges, centers and explicit guides and can disable it", () => {
    const layer = createLayer("rectangle", { x: 20, y: 30 });
    const page = createPage({
      width: 1000,
      height: 800,
      layers: [layer],
      guides: [
        { id: "gx", axis: "x", position: 200 },
        { id: "gy", axis: "y", position: 300 },
      ],
    });
    expect(
      movePatches(page, [layer], { x: 0, y: 0 }, { x: 182, y: 268 }, true, 6)[0]!.patch,
    ).toEqual({ x: 200, y: 300 });
    expect(
      movePatches(page, [layer], { x: 0, y: 0 }, { x: 182, y: 268 }, false, 6)[0]!.patch,
    ).toEqual({ x: 202, y: 298 });
    expect(
      movePatches(page, [layer], { x: 0, y: 0 }, { x: 400, y: 400 }, true, 6)[0]!.patch,
    ).toEqual({ x: 420, y: 430 });
    expect(movePatches(page, [], { x: 0, y: 0 }, { x: 0, y: 0 }, true, 6)).toEqual([]);
  });
  it.each(["nw", "ne", "sw", "se"] as const)(
    "resizes from %s and preserves the opposite anchor under rotation",
    (handle) => {
      const layer = createLayer("rectangle", {
        x: 20,
        y: 30,
        width: 100,
        height: 80,
        rotation: 35,
      });
      const page = createPage({ layers: [layer] });
      const patch = resizePatch(page, layer, handle, { x: 0, y: 0 }, { x: 20, y: 10 }, false).patch;
      const changed = { ...layer, ...patch };
      const oldAnchor = {
        x: handle.includes("w") ? layer.width : 0,
        y: handle.includes("n") ? layer.height : 0,
      };
      const newAnchor = {
        x: handle.includes("w") ? changed.width : 0,
        y: handle.includes("n") ? changed.height : 0,
      };
      const before = transformPoint(getWorldMatrix(page, layer.id), oldAnchor);
      const after = transformPoint(
        getWorldMatrix({ ...page, layers: [changed] }, layer.id),
        newAnchor,
      );
      expect(after.x).toBeCloseTo(before.x);
      expect(after.y).toBeCloseTo(before.y);
    },
  );
  it("constrains aspect ratio and never allows a negative dimension", () => {
    const layer = createLayer("rectangle", { width: 100, height: 50 });
    const page = createPage({ layers: [layer] });
    const proportional = resizePatch(
      page,
      layer,
      "se",
      { x: 0, y: 0 },
      { x: 10, y: 40 },
      true,
    ).patch;
    expect(proportional.width! / proportional.height!).toBe(2);
    const clamped = resizePatch(
      page,
      layer,
      "se",
      { x: 0, y: 0 },
      { x: -1000, y: -1000 },
      false,
    ).patch;
    expect(clamped.width).toBe(1);
    expect(clamped.height).toBe(1);
  });
  it("rotates about the world-space center and supports 15-degree snapping", () => {
    const layer = createLayer("rectangle", { x: 0, y: 0, width: 100, height: 100 });
    const page = createPage({ layers: [layer] });
    expect(
      resizePatch(page, layer, "rotate", { x: 100, y: 50 }, { x: 50, y: 100 }, false).patch
        .rotation,
    ).toBe(90);
    const snapped = resizePatch(page, layer, "rotate", { x: 100, y: 50 }, { x: 80, y: 90 }, true)
      .patch.rotation!;
    expect(snapped % 15).toBe(0);
  });
  it("marquee includes only fully enclosed visible, editable layers", () => {
    const a = createLayer("rectangle", { x: 10, y: 10, width: 20, height: 20 });
    const b = createLayer("rectangle", { x: 90, y: 90, width: 20, height: 20 });
    const group = createLayer("group", { visible: false });
    const hidden = createLayer("rectangle", { parentId: group.id });
    const locked = createLayer("rectangle", { locked: true });
    const invisible = createLayer("rectangle", { visible: false });
    const page = createPage({ layers: [a, b, group, hidden, locked, invisible] });
    expect(boxSelection(page, { x: 100, y: 100 }, { x: 0, y: 0 })).toEqual([a.id]);
    expect(boxSelection(page, { x: 100, y: 100 }, { x: 0, y: 0 }, "intersect")).toEqual([
      a.id,
      b.id,
    ]);
  });
  it("keeps preview outside the document and produces one command per selected root", () => {
    const layer = createLayer("rectangle");
    const page = createPage({ layers: [layer] });
    expect(applyPreview(page, [])).toBe(page);
    const patches = [
      { layerId: layer.id, patch: { x: 20 } },
      { layerId: "__page__", patch: { fill: "#ff0000" } },
    ];
    const preview = applyPreview(page, patches);
    expect(preview.background).toBe(page.background);
    expect(preview.layers[0]!.x).toBe(20);
    expect(page.layers[0]!.x).not.toBe(20);
    expect(patchesToCommands(patches)).toEqual([
      {
        type: "updateLayerPatches",
        patches: patches.map(({ layerId, patch }) => ({ id: layerId, patch })),
      },
    ]);
  });
});

it("click selection toggles only under an additive modifier and preserves an existing multiple selection", () => {
  expect(clickSelection(["a"], "b", true)).toEqual(["a", "b"]);
  expect(clickSelection(["a", "b"], "a", true)).toEqual(["b"]);
  expect(clickSelection(["a", "b"], "a", false)).toEqual(["a", "b"]);
  expect(clickSelection(["a"], "b", false)).toEqual(["b"]);
});

it("intersection marquee includes crossing nested bounds but excludes edge-only contact, locked and mask subtrees", () => {
  const group = createLayer("group", {
    id: "group",
    x: 40,
    y: 40,
    width: 80,
    height: 80,
    rotation: 20,
  });
  const child = createLayer("rectangle", {
    id: "child",
    parentId: group.id,
    x: 10,
    y: 10,
    width: 30,
    height: 30,
  });
  const locked = createLayer("group", { id: "locked", locked: true, width: 300, height: 300 });
  const lockedChild = createLayer("rectangle", { id: "locked-child", parentId: locked.id });
  const edge = createLayer("rectangle", { id: "edge", x: 200, y: 0, width: 50, height: 50 });
  const mask = createLayer("group", { id: "mask", maskSource: true });
  const maskChild = createLayer("rectangle", { id: "mask-child", parentId: mask.id });
  const page = createPage({ layers: [group, child, locked, lockedChild, edge, mask, maskChild] });
  expect(boxSelection(page, { x: 0, y: 0 }, { x: 200, y: 200 }, "intersect")).toEqual([
    "group",
    "child",
  ]);
  expect(boxSelection(page, { x: 65, y: 65 }, { x: 75, y: 75 }, "contain")).toEqual([]);
  expect(boxSelection(page, { x: 65, y: 65 }, { x: 75, y: 75 }, "intersect")).toEqual([
    "group",
    "child",
  ]);
});
it("previews and commits ten thousand distinct moves as one validated atomic undo entry", () => {
  const layers = Array.from({ length: 10000 }, (_, index) =>
    createLayer("rectangle", {
      id: `move-${index}`,
      x: index % 100,
      y: Math.floor(index / 100),
      width: 1,
      height: 1,
    }),
  );
  const page = createPage({ width: 1000, height: 1000, layers });
  const roots = selectedRoots(
    page,
    layers.map((layer) => layer.id),
  );
  expect(roots).toHaveLength(10000);
  const patches = movePatches(page, roots, { x: 1, y: 2 }, { x: 11, y: 22 }, false, 6);
  const preview = applyPreview(page, patches);
  for (const index of [0, 5000, 9999])
    expect(preview.layers[index]).toEqual(
      expect.objectContaining({ x: layers[index]!.x + 10, y: layers[index]!.y + 20 }),
    );
  expect(boxSelection(page, { x: 0, y: 0 }, { x: 100, y: 100 })).toHaveLength(10000);
  expect(patchesToCommands(patches)).toHaveLength(1);
  expect(patchesToCommands([])).toEqual([]);
  expect(
    applyPreview(page, [
      { layerId: layers[0]!.id, patch: { x: 4, y: 6 } },
      { layerId: layers[0]!.id, patch: { x: 9 } },
    ]).layers[0],
  ).toEqual(expect.objectContaining({ x: 9, y: 6 }));
});

it("marquee skips transparent and attached-mask subtrees while retaining a painted group fallback", () => {
  const visible = createLayer("rectangle", { id: "visible", x: 10, y: 10, width: 20, height: 20 });
  const zero = createLayer("rectangle", { id: "zero", opacity: 0 });
  const transparent = createLayer("group", { id: "transparent", opacity: 0 });
  const hiddenChild = createLayer("rectangle", { id: "hidden-child", parentId: transparent.id });
  const mask = createLayer("group", { id: "mask", maskSource: true });
  const maskChild = createLayer("rectangle", { id: "mask-child", parentId: mask.id });
  const group = createLayer("group", { id: "group", x: 0, y: 0, width: 80, height: 80 });
  const attached = createLayer("rectangle", {
    id: "attached",
    parentId: group.id,
    maskSource: true,
  });
  const page = createPage({
    layers: [visible, zero, transparent, hiddenChild, mask, maskChild, group, attached],
  });
  expect(boxSelection(page, { x: 0, y: 0 }, { x: 1000, y: 1000 })).toEqual([visible.id, group.id]);
});

it("keeps prototype-looking preview metadata as own data rather than inheriting new paint", () => {
  const layer = {
    ...createLayer("rectangle", { id: "source" }),
    ...(JSON.parse('{"__proto__":{"fillGradient":{"unexpected":true}}}') as object),
  };
  const page = createPage({ layers: [layer] });
  const output = applyPreview(page, [{ layerId: layer.id, patch: { x: 12 } }]);
  expect(Object.getPrototypeOf(output.layers[0]!)).toBe(Object.prototype);
  expect(Object.hasOwn(output.layers[0]!, "__proto__")).toBe(true);
  expect(output.layers[0]!.fillGradient).toBeUndefined();
  const patch = JSON.parse('{"__proto__":{"fillGradient":{"unexpected":true}},"x":20}') as {
    x: number;
  };
  const patched = applyPreview(
    createPage({ layers: [createLayer("rectangle", { id: "clean" })] }),
    [{ layerId: "clean", patch }],
  );
  expect(Object.getPrototypeOf(patched.layers[0]!)).toBe(Object.prototype);
  expect(patched.layers[0]!.fillGradient).toBeUndefined();
  expect(patched.layers[0]!.x).toBe(20);
});
