import { describe, expect, it, vi } from "vitest";
import { createLayer, createPage, createLayerGeometryIndex, type Asset } from "@musart/core";
import { assetIdentity, createSourceKeys, sourceKey } from "../../src/cache/keys";

describe("bounded layer source cache", () => {
  it("invalidates only pixels and not transforms, names or selection metadata", () => {
    const layer = createLayer("rectangle");
    const page = createPage({ layers: [layer] });
    const key = sourceKey(layer, page, {}, 1);
    expect(
      sourceKey(
        { ...layer, x: 200, y: 100, name: "renamed", locked: true, rotation: 90, opacity: 0.5 },
        page,
        {},
        1,
      ),
    ).toBe(key);
    expect(sourceKey({ ...layer, fill: "#FF0000" }, page, {}, 1)).not.toBe(key);
    expect(sourceKey(layer, page, {}, 2)).not.toBe(key);
  });
  it("includes group child transforms, masking and original asset identity", () => {
    const asset: Asset = {
      id: "asset",
      name: "image",
      mime: "image/png",
      width: 1,
      height: 1,
      dataUrl: "one",
    };
    const group = createLayer("group");
    const child = createLayer("image", {
      parentId: group.id,
      assetId: asset.id,
      mask: { assetId: asset.id, enabled: true, inverted: false },
    });
    const page = createPage({ layers: [group, child] });
    const key = sourceKey(group, page, { asset }, 1);
    expect(sourceKey(group, page, { asset }, 1)).toBe(key);
    expect(
      sourceKey(group, { ...page, layers: [group, { ...child, x: 50 }] }, { asset }, 1),
    ).not.toBe(key);
    expect(sourceKey(group, page, { asset: { ...asset, dataUrl: "two" } }, 1)).not.toBe(key);
  });
  it("bounds the internal asset identity dictionary without reusing identities", () => {
    const layer = createLayer("image", { assetId: "asset" });
    const page = createPage({ layers: [layer] });
    const asset: Asset = {
      id: "asset",
      name: "image",
      mime: "image/png",
      width: 1,
      height: 1,
      dataUrl: "initial",
    };
    const initial = sourceKey(layer, page, { asset }, 1);
    for (let i = 0; i < 130; i++)
      sourceKey(layer, page, { asset: { ...asset, dataUrl: `source-${i}` } }, 1);
    // Eviction without a surviving representative is a safe cache miss.
    expect(sourceKey(layer, page, { asset: { ...asset } }, 1)).not.toBe(initial);
    // Reusing the live original refreshes its weak representative for subsequent clones.
    expect(sourceKey(layer, page, { asset }, 1)).toBe(initial);
    expect(sourceKey(layer, page, { asset: { ...asset } }, 1)).toBe(initial);
  });
});

it("keeps oversized live originals stable without strongly retaining their bytes after unload", () => {
  const asset: Asset = {
    id: "large",
    name: "Large original",
    mime: "image/png",
    width: 1,
    height: 1,
    dataUrl: "x".repeat(9 * 1024 * 1024),
  };
  const first = assetIdentity(asset);
  expect(assetIdentity(asset)).toBe(first);
  expect(assetIdentity({ ...asset })).toBe(first);
  asset.dataUrl = "replacement";
  const replaced = assetIdentity(asset);
  expect(replaced).not.toBe(first);
  expect(assetIdentity({ ...asset })).toBe(replaced);
  expect(assetIdentity(undefined)).toBe("missing");
});
it("invalidates referenced mask paints and world transforms while rejecting render cycles", () => {
  const source = createLayer("rectangle", { id: "mask", maskSource: true }),
    target = createLayer("rectangle", {
      id: "target",
      mask: { layerId: "mask", enabled: true, inverted: false },
    }),
    page = createPage({ layers: [source, target] });
  const key = sourceKey(target, page, {}, 1);
  expect(sourceKey(target, { ...page, layers: [{ ...source, x: 10 }, target] }, {}, 1)).not.toBe(
    key,
  );
  expect(
    sourceKey(target, { ...page, layers: [{ ...source, opacity: 0.2 }, target] }, {}, 1),
  ).not.toBe(key);
  const cyclic = { ...source, mask: { layerId: "target", enabled: true, inverted: false } };
  expect(() => sourceKey(target, { ...page, layers: [cyclic, target] }, {}, 1)).toThrow("Cycle");
});

it("keeps layer source textures when only non-rendered spacing or guide metadata changes", () => {
  const layer = createLayer("rectangle");
  const page = createPage({ layers: [layer] });
  const key = sourceKey(layer, page, {}, 1);
  const metadata = {
    ...layer,
    margin: { top: 10, right: 20, bottom: 30, left: 40 },
    padding: { top: 1, right: 2, bottom: 3, left: 4 },
    guides: [{ id: "guide", axis: "x" as const, position: 10 }],
  };
  expect(sourceKey(metadata, page, {}, 1)).toBe(key);
});

it("indexes 10,000 siblings once and memoizes shared subgraphs within one render job", () => {
  const base = createLayer("rectangle");
  const layers = Array.from({ length: 10000 }, (_, index) => ({
    ...base,
    id: `shape-${index}`,
    x: index,
  }));
  const page = createPage({ layers });
  const filter = vi.spyOn(page.layers, "filter");
  const find = vi.spyOn(page.layers, "find");
  const resolve = createSourceKeys(page, {}, 1);
  const first = resolve(layers[0]!);
  for (const layer of layers) expect(resolve(layer)).toBe(first);
  expect(filter).not.toHaveBeenCalled();
  expect(find).not.toHaveBeenCalled();
  const read = vi.spyOn(JSON, "stringify");
  resolve(layers[0]!);
  expect(read).not.toHaveBeenCalled();
  read.mockRestore();
});

it("does not reuse keys between mutable frames and releases visiting state after errors", () => {
  const child = createLayer("rectangle", { id: "child", parentId: "group" });
  const group = createLayer("group", { id: "group" });
  const page = createPage({ layers: [group, child] });
  const before = createSourceKeys(page, {}, 1)(group);
  child.fill = "#ff0000";
  expect(createSourceKeys(page, {}, 1)(group)).not.toBe(before);
  const cycle = createLayer("rectangle", {
    id: "cycle",
    mask: { enabled: true, inverted: false, layerId: "cycle" },
  });
  const resolve = createSourceKeys(createPage({ layers: [cycle, child, group] }), {}, 1);
  expect(() => resolve(cycle)).toThrow("Cycle");
  expect(() => resolve(cycle)).toThrow("Cycle");
  expect(() => resolve(group)).not.toThrow();
  expect(() => sourceKey(child, page, {}, 1, new Set([child.id]))).toThrow("Cycle");
});

it("keeps deep group keys compact without recursively escaping serialized descendants", () => {
  const layers = Array.from({ length: 64 }, (_, index) =>
    createLayer("group", {
      id: `group-${index}`,
      parentId: index ? `group-${index - 1}` : null,
    }),
  );
  const page = createPage({ layers });
  const key = createSourceKeys(page, {}, 1)(layers[0]!);
  expect(key.length).toBeLessThan(32);
  expect(createSourceKeys(page, {}, 1)(layers[0]!)).toBe(key);
  layers[63]!.fill = "#ff0000";
  expect(createSourceKeys(page, {}, 1)(layers[0]!)).not.toBe(key);
});

it("reuses the render job's geometry index instead of constructing a second mutable-frame index", () => {
  let reads = 0;
  const layer = {
    ...createLayer("rectangle", { id: "shape" }),
    get parentId() {
      reads++;
      return null;
    },
  };
  const page = createPage({ layers: [layer] });
  const geometry = createLayerGeometryIndex(page);
  const before = reads;
  const resolve = createSourceKeys(page, {}, 1, { geometry });
  expect(reads).toBe(before);
  expect(resolve(layer)).toBe(sourceKey(layer, page, {}, 1));
  const afterIndependent = reads;
  resolve(layer);
  expect(reads).toBe(afterIndependent);
  expect(afterIndependent - before).toBeGreaterThan(0);
});
