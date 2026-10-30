import { expect, it } from "vitest";
import {
  assetOriginalIdentity,
  isImageAsset,
  isAudioAsset,
  isOriginalMediaAsset,
  isVideoAsset,
  sameAssetOriginal,
} from "../../src/assets/identity";
import { image, video, audio } from "./fixtures";
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

it("recognizes standalone audio without confusing it with video or image bytes", () => {
  const sound = audio();
  expect(isAudioAsset(sound)).toBe(true);
  expect(isImageAsset(sound)).toBe(false);
  expect(isVideoAsset(sound)).toBe(false);
  expect(isOriginalMediaAsset(sound)).toBe(true);
  expect(isOriginalMediaAsset(image())).toBe(false);
  expect(sameAssetOriginal(sound, { ...sound, name: "Renamed" })).toBe(true);
  expect(sameAssetOriginal(sound, { ...sound, contentRevision: "r2" })).toBe(false);
  expect(
    assetOriginalIdentity({
      ...video(),
      originalId: sound.originalId,
      contentRevision: sound.contentRevision,
      byteLength: sound.byteLength,
    }),
  ).not.toBe(assetOriginalIdentity(sound));
});
