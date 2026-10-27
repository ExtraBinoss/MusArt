import { describe, expect, it } from "vitest";
import { createLayer, createPage, type Asset } from "@musart/core";
import { sourceKey } from "../../src/cache/keys";

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
    expect(sourceKey(layer, page, { asset }, 1)).not.toBe(initial);
  });
});
