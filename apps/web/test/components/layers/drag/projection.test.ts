import { expect, test } from "vitest";
import { createLayer } from "@musart/core";
import { projectLayerDrop } from "../../../../src/components/layers/drag/projection";

test("projects immutable visual stack order and reparenting without changing canonical transforms", () => {
  const a = createLayer("rectangle"),
    b = createLayer("text"),
    group = createLayer("group");
  const layers = [a, b, group];
  const above = projectLayerDrop(layers, a.id, b.id, "before")!;
  expect(above.map((layer) => layer.id)).toEqual([b.id, a.id, group.id]);
  expect(projectLayerDrop(layers, group.id, b.id, "after")!.map((layer) => layer.id)).toEqual([
    a.id,
    group.id,
    b.id,
  ]);
  const inside = projectLayerDrop(layers, a.id, group.id, "inside")!;
  expect(inside.at(-1)).toMatchObject({ id: a.id, parentId: group.id, x: a.x, y: a.y });
  expect(a.parentId).toBeNull();
  expect(layers).toEqual([a, b, group]);
  expect(projectLayerDrop(layers, a.id, b.id, "mask")).toEqual(layers);
  expect(b.mask).toBeNull();
});
test("rejects absent, self, locked ancestor, non-group and dependency-cycle destinations", () => {
  const group = createLayer("group"),
    child = createLayer("rectangle", { parentId: group.id });
  const other = createLayer("ellipse"),
    layers = [group, child, other];
  expect(projectLayerDrop(layers, "missing", other.id, "before")).toBeNull();
  expect(projectLayerDrop(layers, child.id, "missing", "before")).toBeNull();
  expect(projectLayerDrop(layers, child.id, child.id, "before")).toBeNull();
  expect(projectLayerDrop(layers, group.id, child.id, "inside")).toBeNull();
  expect(projectLayerDrop(layers, group.id, child.id, "before")).toBeNull();
  expect(projectLayerDrop(layers, group.id, child.id, "mask")).toBeNull();
  expect(
    projectLayerDrop([{ ...group, locked: true }, child, other], child.id, other.id, "before"),
  ).toBeNull();
  expect(
    projectLayerDrop([group, child, { ...other, locked: true }], child.id, other.id, "mask"),
  ).toBeNull();
  const masked = { ...other, mask: { layerId: group.id, enabled: true, inverted: false } };
  expect(projectLayerDrop([group, child, masked], other.id, group.id, "inside")).toBeNull();
  const nested = createLayer("group", { parentId: group.id });
  expect(projectLayerDrop([group, nested], group.id, nested.id, "inside")).toBeNull();
  const cyclic = { ...group, parentId: group.id };
  expect(projectLayerDrop([cyclic, other], group.id, other.id, "before")).toBeNull();
});
test("bounds dependency traversal before a stack overflow", () => {
  const layers = Array.from({ length: 131 }, (_, i) =>
    createLayer("group", { id: `g${i}`, parentId: i ? `g${i - 1}` : null }),
  );
  const shape = createLayer("rectangle");
  expect(projectLayerDrop([...layers, shape], shape.id, layers[130]!.id, "inside")).toBeNull();
});
