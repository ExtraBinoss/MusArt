import type { Asset, ImageAsset, VideoAsset } from "./model";

export function isVideoAsset(asset: Asset): asset is VideoAsset {
  return asset.kind === "video";
}

export function isImageAsset(asset: Asset): asset is ImageAsset {
  return asset.kind !== "video";
}

/** Immutable-original comparison; video bytes never enter document/hash/journal messages. */
export function assetOriginalIdentity(asset: Asset): string {
  return isVideoAsset(asset)
    ? JSON.stringify(["video", asset.originalId, asset.contentRevision, asset.byteLength])
    : asset.dataUrl;
}

export function sameAssetOriginal(left: Asset | undefined, right: Asset | undefined): boolean {
  return (
    left === right ||
    Boolean(
      left &&
      right &&
      isVideoAsset(left) === isVideoAsset(right) &&
      assetOriginalIdentity(left) === assetOriginalIdentity(right),
    )
  );
}
