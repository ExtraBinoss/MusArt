import { expect, test } from "vitest";
import { createLayer } from "@musart/core";
import { layerDragWindow } from "../../../../src/components/layers/drag/window";
import { projectLayerTree } from "../../../../src/components/layers/tree/projection";
test("native source DOM order stays canonical while visual positions project the insertion", () => {
  const layers = ["a", "b", "c"].map((id) => createLayer("rectangle", { id }));
  const canonical = projectLayerTree(layers, new Set(), new Set()),
    projected = projectLayerTree([layers[1]!, layers[2]!, layers[0]!], new Set(), new Set());
  expect(
    layerDragWindow(projected, canonical, 0, 3, "a").map(({ entry, at }) => [entry.key, at]),
  ).toEqual([
    ["c", 1],
    ["b", 2],
    ["a", 0],
  ]);
  expect(layerDragWindow(projected, canonical, 0, 3, null).map(({ entry }) => entry.key)).toEqual([
    "a",
    "c",
    "b",
  ]);
});
test("virtual scrolling retains only the native source beyond its visible window", () => {
  const entries = projectLayerTree(
    Array.from({ length: 10000 }, (_, at) => createLayer("rectangle", { id: String(at) })),
    new Set(),
    new Set(),
  );
  const result = layerDragWindow(entries, entries, 500, 520, "0");
  expect(result).toHaveLength(21);
  expect(result.at(-1)).toEqual({ entry: entries.at(-1), at: 9999 });
  expect(layerDragWindow(entries, entries, 500, 520, "missing")).toHaveLength(20);
  expect(layerDragWindow(entries, entries, 500, 520, entries[505]!.key)).toHaveLength(20);
});
