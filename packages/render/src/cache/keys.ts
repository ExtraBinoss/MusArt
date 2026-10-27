import {
  getAncestors,
  getWorldMatrix,
  type Asset,
  type Composition,
  type Layer,
} from "@musart/core";

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
  trail: ReadonlySet<string> = new Set(),
): string {
  if (trail.has(layer.id)) throw new Error("Cycle du graphe de rendu.");
  const nextTrail = new Set(trail);
  nextTrail.add(layer.id);
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
      sourceKey(child, page, assets, scale, nextTrail),
    ]);
  const maskSource =
    layer.mask?.enabled && layer.mask.layerId
      ? page.layers.find((item) => item.id === layer.mask!.layerId)
      : undefined;
  const maskKey = maskSource
    ? [
        getWorldMatrix(page, layer.id),
        getWorldMatrix(page, maskSource.id),
        [...getAncestors(page, maskSource.id), maskSource].map((node) => [
          node.visible,
          node.opacity,
        ]),
        sourceKey(maskSource, page, assets, scale, nextTrail),
      ]
    : null;
  return JSON.stringify([
    source,
    scale,
    page.colorSpace ?? "srgb",
    maskKey,
    assetIdentity(layer.assetId ? assets[layer.assetId] : undefined),
    assetIdentity(layer.mask?.assetId ? assets[layer.mask.assetId] : undefined),
    children,
  ]);
}
