import { expect, it } from "vitest";
import {
  createLayer,
  createPage,
  createLayerGeometryIndex,
  transformPoint,
  type Layer,
  type Composition,
} from "@musart/core";
import { TransformSnapping } from "../../../../src/canvas/interaction/snapping/transform";
import { applyPreview, patchesToCommands } from "../../../../src/canvas/interaction/gestures";
function corner(page: Composition, layer: Layer, west = false, north = false) {
  return transformPoint(createLayerGeometryIndex(page).worldMatrix(layer.id), {
    x: west ? 0 : layer.width,
    y: north ? 0 : layer.height,
  });
}
it("moves the collective selection to an object edge, with one bulk command and no canonical mutation", () => {
  const a = createLayer("rectangle", { id: "a", x: 20, y: 20, width: 40, height: 40 }),
    b = createLayer("rectangle", { id: "b", x: 80, y: 20, width: 20, height: 20 }),
    target = createLayer("rectangle", { id: "target", x: 200, y: 100, width: 80, height: 60 });
  const page = createPage({ width: 1000, height: 800, layers: [a, b, target] }),
    transform = new TransformSnapping(page, [a, b]);
  const result = transform.move({ x: 0, y: 0 }, { x: 97, y: 13 }, true, 6);
  expect(result.patches.map((p) => p.patch.x)).toEqual([120, 180]);
  expect(result.cues.some((c) => c.targetId === target.id && c.axis === "x")).toBe(true);
  expect(patchesToCommands(result.patches)).toHaveLength(1);
  expect(page.layers[0]!.x).toBe(20);
  expect(transform.move({ x: 0, y: 0 }, { x: 97, y: 13 }, false, 6).patches[0]!.patch.x).toBe(117);
  expect(transform.move({ x: 0, y: 0 }, { x: 97, y: 13 }, false, 6).cues).toEqual([]);
});
it("maps a snapped world displacement back through a rotated parent", () => {
  const group = createLayer("group", {
    id: "group",
    x: 100,
    y: 100,
    width: 100,
    height: 100,
    rotation: 90,
  });
  const child = createLayer("rectangle", {
    id: "child",
    parentId: group.id,
    x: 10,
    y: 20,
    width: 30,
    height: 40,
  });
  const page = createPage({
    width: 1000,
    height: 800,
    layers: [group, child],
    guides: [{ id: "manual", axis: "x", position: 200 }],
  });
  const result = new TransformSnapping(page, [child]).move(
    { x: 0, y: 0 },
    { x: 17, y: 3 },
    true,
    6,
  );
  const next = applyPreview(page, result.patches),
    bounds = createLayerGeometryIndex(next).worldBounds(child.id);
  expect(bounds.x + bounds.width).toBeCloseTo(200);
  expect(result.patches[0]!.patch.y).toBeCloseTo(0);
  expect(result.cues.some((c) => c.targetId === "manual")).toBe(true);
});
it.each(["nw", "ne", "sw", "se"] as const)(
  "snaps resized %s corner while fixing its opposite anchor",
  (handle) => {
    const west = handle.includes("w"),
      north = handle.includes("n");
    const layer = createLayer("rectangle", {
      id: "moving",
      x: 100,
      y: 100,
      width: 100,
      height: 80,
    });
    const page = createPage({
      width: 1000,
      height: 800,
      layers: [layer],
      guides: [{ id: "manual", axis: "x", position: west ? 83 : 217 }],
    });
    const from = corner(page, layer, west, north),
      to = { x: from.x + (west ? -14 : 14), y: from.y + (north ? -10 : 10) };
    const result = new TransformSnapping(page, [layer]).resize(handle, from, to, false, true, 6),
      next = applyPreview(page, result.patches),
      changed = next.layers[0]!;
    expect(corner(next, changed, west, north).x).toBeCloseTo(west ? 83 : 217);
    expect(corner(next, changed, !west, !north)).toEqual(corner(page, layer, !west, !north));
    expect(result.cues.some((c) => c.targetId === "manual")).toBe(true);
  },
);
it("preserves aspect ratio under parent/layer rotations and only publishes achieved snap axes", () => {
  const group = createLayer("group", {
    id: "group",
    x: 180,
    y: 100,
    width: 200,
    height: 200,
    rotation: 25,
  });
  const layer = createLayer("rectangle", {
    id: "moving",
    parentId: group.id,
    x: 20,
    y: 20,
    width: 100,
    height: 50,
    rotation: 15,
  });
  const initial = createPage({ width: 1200, height: 900, layers: [group, layer] }),
    from = corner(initial, layer);
  const anchor = corner(initial, layer, true, true),
    desired = { x: anchor.x + (from.x - anchor.x) * 1.2, y: anchor.y + (from.y - anchor.y) * 1.2 };
  const page = { ...initial, guides: [{ id: "manual", axis: "x" as const, position: desired.x }] };
  const result = new TransformSnapping(page, [layer]).resize(
      "se",
      from,
      { x: desired.x - 1, y: desired.y - 1 },
      true,
      true,
      6,
    ),
    next = applyPreview(page, result.patches),
    changed = next.layers[1]!;
  expect(changed.width / changed.height).toBeCloseTo(2);
  expect(corner(next, changed).x).toBeCloseTo(desired.x);
  const fixed = corner(next, changed, true, true);
  expect(fixed.x).toBeCloseTo(anchor.x);
  expect(fixed.y).toBeCloseTo(anchor.y);
  for (const cue of result.cues) expect(corner(next, changed)[cue.axis]).toBeCloseTo(cue.position);
});
it("returns raw transforms for disabled/rotation gestures, clamped shapes and missing selection", () => {
  const layer = createLayer("rectangle", { id: "moving", x: 100, y: 100, width: 20, height: 10 }),
    page = createPage({ layers: [layer] });
  const transform = new TransformSnapping(page, [layer]);
  expect(
    transform.resize("se", { x: 120, y: 110 }, { x: 123, y: 113 }, false, false, 6).cues,
  ).toEqual([]);
  expect(
    transform.resize("rotate", { x: 120, y: 105 }, { x: 110, y: 115 }, true, true, 6).patches[0]!
      .patch.rotation,
  ).toBe(90);
  expect(
    transform.resize("nw", { x: 100, y: 100 }, { x: 500, y: 500 }, false, true, 6).patches[0]!.patch
      .width,
  ).toBe(1);
  expect(
    new TransformSnapping(page, []).resize("se", { x: 0, y: 0 }, { x: 10, y: 10 }, false, true, 6),
  ).toEqual({ patches: [], cues: [] });
  expect(
    new TransformSnapping(createPage(), []).move({ x: 0, y: 0 }, { x: 10, y: 10 }, true, 6),
  ).toEqual({ patches: [], cues: [] });
});
