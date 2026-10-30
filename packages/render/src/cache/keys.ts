import {
  createLayerGeometryIndex,
  type Asset,
  type Composition,
  type Layer,
  type LayerGeometryIndex,
} from "@musart/core";
import { AssetIdentities } from "./asset-identities";
import { SourceIdentities } from "./source-identities";
import { morphIdentity } from "../surface/morph/identity";

const sourceIdentities = new SourceIdentities();
const assetIds = new AssetIdentities();
export function assetIdentity(asset: Asset | undefined): string {
  return assetIds.identity(asset);
}

export function sourceKey(
  layer: Layer,
  page: Composition,
  assets: Record<string, Asset>,
  scale: number,
  trail: ReadonlySet<string> = new Set(),
): string {
  return createSourceKeys(page, assets, scale, { trail })(layer);
}

/** One indexed, memoized key resolver for a render job, including shared mask dependencies. */
export function createSourceKeys(
  page: Composition,
  assets: Record<string, Asset>,
  scale: number,
  options: {
    trail?: ReadonlySet<string>;
    geometry?: LayerGeometryIndex;
    videoStamp?: (layerId: string) => string | null;
  } = {},
): (layer: Layer) => string {
  const geometry = options.geometry ?? createLayerGeometryIndex(page);
  const keys = new WeakMap<Layer, string>();
  const visiting = new Set(options.trail);
  return function resolve(layer: Layer): string {
    if (visiting.has(layer.id)) throw new Error("Cycle du graphe de rendu.");
    const cached = keys.get(layer);
    if (cached !== undefined) return cached;
    visiting.add(layer.id);
    try {
      const {
        id: _id,
        name: _name,
        x: _x,
        y: _y,
        rotation: _rotation,
        scaleX: _scaleX,
        scaleY: _scaleY,
        opacity: _opacity,
        visible: _visible,
        locked: _locked,
        margin: _margin,
        padding: _padding,
        guides: _guides,
        parentId: _parentId,
        blendMode: _blendMode,
        ...source
      } = layer;
      const children = geometry
        .children(layer.id)
        .map((child) => [
          child.x,
          child.y,
          child.rotation,
          child.scaleX ?? 1,
          child.scaleY ?? 1,
          child.opacity,
          child.visible,
          child.blendMode,
          resolve(child),
        ]);
      const maskSource =
        layer.mask?.enabled && layer.mask.layerId
          ? geometry.byId.get(layer.mask.layerId)
          : undefined;
      const maskKey = maskSource
        ? [
            geometry.worldMatrix(layer.id),
            geometry.worldMatrix(maskSource.id),
            [...geometry.ancestors(maskSource.id), maskSource].map((node) => [
              node.visible,
              node.opacity,
            ]),
            resolve(maskSource),
          ]
        : null;
      const key = sourceIdentities.intern(
        JSON.stringify([
          {
            ...source,
            effects: source.effects.map((effect) =>
              effect.shapeMorph
                ? { ...effect, shapeMorph: morphIdentity(effect.shapeMorph) }
                : effect,
            ),
          },
          scale,
          page.colorSpace ?? "srgb",
          maskKey,
          assetIdentity(layer.assetId ? assets[layer.assetId] : undefined),
          layer.kind === "video" ? (options.videoStamp?.(layer.id) ?? null) : null,
          assetIdentity(layer.mask?.assetId ? assets[layer.mask.assetId] : undefined),
          children,
        ]),
      );
      keys.set(layer, key);
      return key;
    } finally {
      visiting.delete(layer.id);
    }
  };
}
