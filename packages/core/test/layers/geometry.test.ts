import { describe, expect, it } from "vitest";
import { createLayer, createPage } from "../../src/document/factories";
import {
  getAncestors,
  getDescendants,
  getWorldBounds,
  getWorldMatrix,
  hitTest,
  IDENTITY,
  invertMatrix,
  layerTransform,
  multiplyMatrices,
  snap,
  transformPoint,
} from "../../src/layers/geometry";

describe("geometry and hierarchy", () => {
  it("composes and reverses affine transforms including rotation around layer center", () => {
    const layer = createLayer("rectangle", { x: 100, y: 200, width: 40, height: 20, rotation: 90 });
    const matrix = layerTransform(layer);
    const point = transformPoint(matrix, { x: 0, y: 0 });
    expect(point.x).toBeCloseTo(130);
    expect(point.y).toBeCloseTo(190);
    expect(transformPoint(invertMatrix(matrix), point).x).toBeCloseTo(0);
    expect(transformPoint(invertMatrix(matrix), point).y).toBeCloseTo(0);
    expect(multiplyMatrices(IDENTITY, [2, 0, 0, 2, 10, 20])).toEqual([2, 0, 0, 2, 10, 20]);
    expect(() => invertMatrix([0, 0, 0, 0, 0, 0])).toThrow("non inversible");
  });
  it("computes world bounds and ancestor transforms for nested groups", () => {
    const parent = createLayer("group", { id: "parent", x: 100, y: 200, width: 500, height: 500 });
    const group = createLayer("group", {
      id: "group",
      parentId: "parent",
      x: 30,
      y: 40,
      width: 200,
      height: 200,
    });
    const child = createLayer("rectangle", {
      id: "child",
      parentId: "group",
      x: 10,
      y: 20,
      width: 40,
      height: 20,
      rotation: 90,
    });
    const page = createPage({ layers: [child, group, parent] });
    expect(getAncestors(page, "child").map((layer) => layer.id)).toEqual(["parent", "group"]);
    expect(getWorldMatrix(page, "child")[4]).toBeCloseTo(170);
    const bounds = getWorldBounds(page, "child");
    expect(bounds.x).toBeCloseTo(150);
    expect(bounds.y).toBeCloseTo(250);
    expect(bounds.width).toBeCloseTo(20);
    expect(bounds.height).toBeCloseTo(40);
    expect(getDescendants(page, ["parent"]).map((layer) => layer.id)).toEqual([
      "child",
      "group",
      "parent",
    ]);
    expect(getDescendants(page, ["missing"])).toEqual([]);
    expect(getAncestors(page, "missing")).toEqual([]);
    expect(() => getWorldMatrix(page, "missing")).toThrow("introuvable");
    expect(() => getWorldBounds(page, "missing")).toThrow("introuvable");
    child.parentId = "missing";
    expect(() => getAncestors(page, "child")).toThrow("Parent introuvable");
    child.parentId = "group";
    group.parentId = "child";
    expect(() => getAncestors(page, "child")).toThrow("Cycle");
  });
  it("selects the topmost unlocked visible shape in its actual local geometry", () => {
    const back = createLayer("rectangle", { id: "back", x: 0, y: 0, width: 100, height: 100 });
    const front = createLayer("ellipse", { id: "front", x: 0, y: 0, width: 100, height: 100 });
    const page = createPage({ layers: [back, front] });
    expect(hitTest(page, { x: 50, y: 50 })?.id).toBe("front");
    expect(hitTest(page, { x: 1, y: 1 })?.id).toBe("back");
    front.locked = true;
    expect(hitTest(page, { x: 50, y: 50 })?.id).toBe("back");
    front.locked = false;
    front.visible = false;
    expect(hitTest(page, { x: 50, y: 50 })?.id).toBe("back");
    front.visible = true;
    front.opacity = 0;
    expect(hitTest(page, { x: 50, y: 50 })?.id).toBe("back");
    expect(hitTest(page, { x: -1, y: 10 })).toBeNull();
    expect(hitTest(page, { x: 200, y: 200 })).toBeNull();
    const group = createLayer("group", { id: "group", x: 200, y: 0, width: 100, height: 100 });
    const child = createLayer("rectangle", {
      id: "child",
      parentId: "group",
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    });
    page.layers.push(group, child);
    expect(hitTest(page, { x: 215, y: 15 })?.id).toBe("child");
    expect(hitTest(page, { x: 270, y: 70 })?.id).toBe("group");
    group.locked = true;
    expect(hitTest(page, { x: 215, y: 15 })).toBeNull();
  });
  it("snaps only inside the configured threshold, with deterministic tie breaking", () => {
    expect(snap(12, [10, 20])).toBe(10);
    expect(snap(12, [10, 14])).toBe(14);
    expect(snap(12, [0, 30])).toBe(12);
    expect(snap(12, [10], 1)).toBe(12);
    expect(snap(12, [])).toBe(12);
  });
});
it("ignores attached mask sources and their subtrees while keeping painted targets and group fallback selectable", () => {
  const target = createLayer("rectangle", {
    id: "target",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    mask: { layerId: "mask", enabled: true, inverted: false },
  });
  const mask = createLayer("rectangle", {
    id: "mask",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    maskSource: true,
  });
  const group = createLayer("group", { id: "group", x: 200, y: 0, width: 100, height: 100 });
  const child = createLayer("rectangle", {
    id: "mask-child",
    parentId: "group",
    x: 10,
    y: 10,
    width: 20,
    height: 20,
    maskSource: true,
  });
  const page = createPage({ layers: [target, mask, group, child] });
  expect(hitTest(page, { x: 50, y: 50 })?.id).toBe(target.id);
  expect(hitTest(page, { x: 215, y: 15 })?.id).toBe(group.id);
  group.maskSource = true;
  child.maskSource = false;
  expect(hitTest(page, { x: 215, y: 15 })).toBeNull();
  expect(getWorldBounds(page, child.id)).toEqual({ x: 210, y: 10, width: 20, height: 20 });
});
