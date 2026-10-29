import { expect, it } from "vitest";
import {
  assetOriginalIdentity,
  isImageAsset,
  isVideoAsset,
  sameAssetOriginal,
} from "../../src/assets/identity";
import { image, video } from "./fixtures";
it("recognizes legacy images and compares original bytes separately from authored metadata", () => {
  const still = image(),
    clip = video();
  expect(isImageAsset(still)).toBe(true);
  expect(isVideoAsset(still)).toBe(false);
  expect(isImageAsset(clip)).toBe(false);
  expect(isVideoAsset(clip)).toBe(true);
  expect(sameAssetOriginal(still, { ...still, kind: "image", name: "Renamed" })).toBe(true);
  expect(sameAssetOriginal(still, { ...still, dataUrl: "data:image/png;base64,BBBB" })).toBe(false);
  expect(sameAssetOriginal(clip, { ...clip, id: "clone" })).toBe(true);
  expect(sameAssetOriginal(clip, { ...clip, contentRevision: "new" })).toBe(false);
  expect(sameAssetOriginal(undefined, clip)).toBe(false);
  expect(sameAssetOriginal(still, clip)).toBe(false);
  expect(sameAssetOriginal(undefined, undefined)).toBe(true);
});
it("does not collide when durable original IDs or revisions contain separators", () => {
  const clip = video();
  expect(assetOriginalIdentity({ ...clip, originalId: "a:b", contentRevision: "c" })).not.toBe(
    assetOriginalIdentity({ ...clip, originalId: "a", contentRevision: "b:c" }),
  );
});
