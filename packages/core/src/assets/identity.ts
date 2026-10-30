import type { Asset, AudioAsset, ImageAsset, OriginalMediaAsset, VideoAsset } from "./model";

export function isVideoAsset(asset: Asset): asset is VideoAsset {
  return asset.kind === "video";
}

export function isImageAsset(asset: Asset): asset is ImageAsset {
  return asset.kind === undefined || asset.kind === "image";
}

export function isAudioAsset(asset: Asset): asset is AudioAsset {
  return asset.kind === "audio";
}
export function isOriginalMediaAsset(asset: Asset): asset is OriginalMediaAsset {
  return asset.kind === "video" || asset.kind === "audio";
}

/** Immutable-original comparison; video bytes never enter document/hash/journal messages. */
export function assetOriginalIdentity(asset: Asset): string {
  return isOriginalMediaAsset(asset)
    ? JSON.stringify([asset.kind, asset.originalId, asset.contentRevision, asset.byteLength])
    : asset.dataUrl;
}

export function sameAssetOriginal(left: Asset | undefined, right: Asset | undefined): boolean {
  return (
    left === right ||
    Boolean(
      left &&
      right &&
      isImageAsset(left) === isImageAsset(right) &&
      assetOriginalIdentity(left) === assetOriginalIdentity(right),
    )
  );
}
