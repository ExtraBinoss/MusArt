import type { Asset, Composition, Layer } from "@musart/core";

const assetIds = new Map<string, number>();
let nextAssetId = 0;
export function assetIdentity(asset: Asset | undefined): number {
  if (!asset) return -1;
  const existing = assetIds.get(asset.dataUrl);
  if (existing !== undefined) return existing;
  const id = nextAssetId++;
  assetIds.set(asset.dataUrl, id);
  if (assetIds.size > 128) assetIds.delete(assetIds.keys().next().value!);
  return id;
}

export function sourceKey(
  layer: Layer,
  page: Composition,
  assets: Record<string, Asset>,
  scale: number,
): string {
  const {
    id: _id,
    name: _name,
    x: _x,
    y: _y,
    rotation: _rotation,
    opacity: _opacity,
    visible: _visible,
    locked: _locked,
    parentId: _parentId,
    blendMode: _blendMode,
    ...source
  } = layer;
  const children = page.layers
    .filter((child) => child.parentId === layer.id)
    .map((child) => [
      child.x,
      child.y,
      child.rotation,
      child.opacity,
      child.visible,
      child.blendMode,
      sourceKey(child, page, assets, scale),
    ]);
  return JSON.stringify([
    source,
    scale,
    assetIdentity(layer.assetId ? assets[layer.assetId] : undefined),
    assetIdentity(layer.mask ? assets[layer.mask.assetId] : undefined),
    children,
  ]);
}
