import { expect, test } from "vitest";
import { createEffect, createLayer } from "@musart/core";
import {
  flattenLayerTree,
  projectLayerTree,
} from "../../../../src/components/layers/tree/projection";
test("projects effects and mask references before real child layers with stable keys and nesting", () => {
  const group = createLayer("group", { id: "g", effects: [createEffect("grain")] }),
    child = createLayer("rectangle", {
      id: "c",
      parentId: "g",
      mask: { assetId: "a", enabled: true, inverted: false },
    }),
    root = createLayer("text", { id: "t" });
  const layers = [group, child, root];
  expect(flattenLayerTree(layers).map((layer) => layer.id)).toEqual(["t", "g", "c"]);
  expect(flattenLayerTree(layers, "g").map((layer) => layer.id)).toEqual(["c"]);
  const tree = projectLayerTree(layers, new Set(), new Set(["c"]));
  expect(tree.map((entry) => [entry.kind, entry.depth])).toEqual([
    ["layer", 0],
    ["layer", 0],
    ["effect", 1],
    ["layer", 1],
    ["mask", 2],
  ]);
  expect(new Set(tree.map((entry) => entry.key)).size).toBe(tree.length);
  expect(
    projectLayerTree(layers, new Set(["g"]), new Set()).map((entry) => entry.layer.id),
  ).toEqual(["t", "g"]);
  expect(
    projectLayerTree(layers, new Set(["g"]), new Set(), "g").map((entry) => entry.kind),
  ).toEqual(["layer", "layer", "effect", "layer"]);
});
test("iteratively projects ten thousand siblings and deep hierarchies without rescanning each branch", () => {
  const layers = Array.from({ length: 10000 }, (_, at) =>
    createLayer("rectangle", { id: `l${at}` }),
  );
  expect(projectLayerTree(layers, new Set(), new Set())).toHaveLength(10000);
  const chain = Array.from({ length: 1000 }, (_, at) =>
    createLayer("group", { id: `g${at}`, parentId: at ? `g${at - 1}` : null }),
  );
  expect(projectLayerTree(chain, new Set(), new Set()).at(-1)?.depth).toBe(999);
});
