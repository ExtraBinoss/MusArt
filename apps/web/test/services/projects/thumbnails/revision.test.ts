import { beforeEach, expect, it, vi } from "vitest";
import { createLayer, createPage, type Asset } from "@musart/core";
import {
  clearThumbnailRevisionCache,
  thumbnailRevision,
} from "../../../../src/services/projects/thumbnails/revision";
beforeEach(() => clearThumbnailRevisionCache());
it("hashes pixel fields but ignores names, guides, locks and original metadata, caching original bytes", async () => {
  const asset: Asset = {
      id: "asset",
      name: "photo",
      mime: "image/png",
      dataUrl: "original",
      width: 1,
      height: 1,
    },
    layer = createLayer("image", { assetId: "asset" }),
    page = createPage({ layers: [layer] });
  const digest = vi.spyOn(crypto.subtle, "digest");
  const first = await thumbnailRevision(page, { asset });
  expect(
    await thumbnailRevision(
      {
        ...page,
        name: "Renamed",
        guides: [{ id: "g", axis: "x", position: 5 }],
        rulers: true,
        layers: [{ ...layer, name: "Renamed", locked: true }],
      },
      { asset: { ...asset, name: "different" } },
    ),
  ).toBe(first);
  expect(digest).toHaveBeenCalledTimes(3);
  expect(await thumbnailRevision({ ...page, background: "#ff0000" }, { asset })).not.toBe(first);
  expect(await thumbnailRevision(page, { asset: { ...asset, dataUrl: "changed" } })).not.toBe(
    first,
  );
  expect(await thumbnailRevision(page, {})).not.toBe(first);
});
it("keeps effect IDs and vector attribution outside the paint signature and canonicalizes object keys", async () => {
  const layer = createLayer("vector", {
      vector: { viewBox: "0 0 10 10", path: "M0 0h10v10H0z", attribution: "MIT" },
    }),
    page = createPage({ layers: [layer] });
  const first = await thumbnailRevision(page, {});
  expect(
    await thumbnailRevision(
      {
        ...page,
        layers: [{ ...layer, vector: { ...layer.vector!, attribution: "Different credit" } }],
      },
      {},
    ),
  ).toBe(first);
  expect(
    await thumbnailRevision(
      { ...page, layers: [{ ...layer, vector: { ...layer.vector!, path: "M0 0h5v5H0z" } }] },
      {},
    ),
  ).not.toBe(first);
});
it("bounds digest retention, invalidates replaced originals and retries failed digests", async () => {
  const layer = createLayer("image", { assetId: "asset" }),
    page = createPage({ layers: [layer] });
  const make = (id: string): Asset => ({
    id,
    name: id,
    mime: "image/png",
    width: 1,
    height: 1,
    dataUrl: id,
  });
  for (let index = 0; index < 130; index++)
    await thumbnailRevision(
      { ...page, layers: [{ ...layer, assetId: String(index) }] },
      { [index]: make(String(index)) },
    );
  const digest = vi.spyOn(crypto.subtle, "digest");
  await thumbnailRevision({ ...page, layers: [{ ...layer, assetId: "0" }] }, { "0": make("0") });
  expect(digest).toHaveBeenCalledTimes(2);
  clearThumbnailRevisionCache();
  digest.mockRejectedValueOnce(new Error("hash failed"));
  await expect(thumbnailRevision(page, { asset: make("asset") })).rejects.toThrow("hash failed");
  await expect(thumbnailRevision(page, { asset: make("asset") })).resolves.toMatch(
    /^[a-f0-9]{64}$/,
  );
});
