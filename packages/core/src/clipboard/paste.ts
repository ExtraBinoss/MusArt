import { sameAssetOriginal } from "../assets/identity";
import type { Asset, Command, Composition, Project } from "../document/model";
import type { Point } from "../layers/geometry";
import type { ClipboardContent } from "./model";
import type { MotionPropertyTarget } from "../motion/properties/model";
import { cloneValue } from "../document/immutable";

function reservedIds(project: Project): Set<string> {
  const result = new Set([project.id, ...Object.keys(project.assets)]);
  for (const page of project.pages) {
    result.add(page.id);
    for (const guide of page.guides) result.add(guide.id);
    for (const track of page.motion?.audioTracks ?? []) result.add(track.id);
    for (const track of page.motion?.tracks ?? []) {
      result.add(track.id);
      for (const animation of track.animations ?? []) result.add(animation.id);
      for (const property of track.properties) {
        result.add(property.id);
        for (const key of property.keyframes) result.add(key.id);
      }
    }
    for (const layer of page.layers) {
      result.add(layer.id);
      for (const effect of layer.effects) result.add(effect.id);
      for (const guide of layer.guides ?? []) result.add(guide.id);
    }
  }
  return result;
}

/** Fresh graph identities and asset insertion are prepared before a single validated transaction. */
export function pasteContent(
  content: ClipboardContent,
  destination: Project,
  point: Point,
  nextId: () => string,
): { commands: Command[]; selection: string[]; pageId?: string } {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    throw new RangeError("Invalid paste point.");
  const reserved = reservedIds(destination);
  function allocate() {
    for (let attempt = 0; attempt < 100; attempt++) {
      const id = nextId();
      if (typeof id !== "string" || !id.length || id.length > 160)
        throw new TypeError("Invalid clipboard identity.");
      if (reserved.has(id)) continue;
      reserved.add(id);
      return id;
    }
    throw new Error("Clipboard identity allocator is exhausted.");
  }
  const page = cloneValue(content.document.pages[0]!);
  const ids = new Map<string, string>();
  const assets: Asset[] = [];
  for (const [id, asset] of Object.entries(content.document.assets)) {
    const candidate = destination.assets[id];
    const existing =
      candidate &&
      candidate.mime === asset.mime &&
      candidate.width === asset.width &&
      candidate.height === asset.height &&
      sameAssetOriginal(candidate, asset)
        ? candidate
        : undefined;
    const identity = existing?.id ?? allocate();
    ids.set(id, identity);
    if (!existing) assets.push({ ...asset, id: identity });
  }
  ids.set(page.id, allocate());
  for (const guide of page.guides) ids.set(guide.id, allocate());
  for (const layer of page.layers) {
    ids.set(layer.id, allocate());
    for (const effect of layer.effects) ids.set(effect.id, allocate());
    for (const guide of layer.guides ?? []) ids.set(guide.id, allocate());
  }
  for (const track of page.motion?.audioTracks ?? []) ids.set(track.id, allocate());
  for (const track of page.motion?.tracks ?? []) {
    ids.set(track.id, allocate());
    for (const animation of track.animations ?? []) ids.set(animation.id, allocate());
    for (const property of track.properties) {
      ids.set(property.id, allocate());
      for (const key of property.keyframes) ids.set(key.id, allocate());
    }
  }
  const dx = content.kind === "selection" ? point.x - page.width / 2 : 0;
  const dy = content.kind === "selection" ? point.y - page.height / 2 : 0;
  function remapTarget(target: MotionPropertyTarget): MotionPropertyTarget {
    return target.kind === "layer"
      ? { ...target, layerId: ids.get(target.layerId)! }
      : { ...target, layerId: ids.get(target.layerId)!, effectId: ids.get(target.effectId)! };
  }
  const cloned: Composition = {
    ...page,
    id: ids.get(page.id)!,
    ...(page.motion
      ? {
          motion: {
            ...page.motion,
            ...(page.motion.audioTracks
              ? {
                  audioTracks: page.motion.audioTracks.map((track) => ({
                    ...track,
                    id: ids.get(track.id)!,
                    assetId: ids.get(track.assetId)!,
                  })),
                }
              : {}),
            tracks: page.motion.tracks.map((track) => ({
              ...track,
              id: ids.get(track.id)!,
              layerId: ids.get(track.layerId)!,
              ...(track.animations
                ? {
                    animations: track.animations.map((animation) => ({
                      ...animation,
                      id: ids.get(animation.id)!,
                      effectIds: animation.effectIds.map((id) => ids.get(id)!),
                    })),
                  }
                : {}),
              properties: track.properties.map((property) => ({
                ...property,
                id: ids.get(property.id)!,
                target: remapTarget(property.target),
                keyframes: property.keyframes.map((key) => ({ ...key, id: ids.get(key.id)! })),
              })),
            })),
          },
        }
      : {}),
    guides: page.guides.map((guide) => ({ ...guide, id: ids.get(guide.id)! })),
    layers: page.layers.map((layer) => ({
      ...layer,
      id: ids.get(layer.id)!,
      parentId: layer.parentId ? ids.get(layer.parentId)! : null,
      x: layer.x + (layer.parentId ? 0 : dx),
      y: layer.y + (layer.parentId ? 0 : dy),
      assetId: layer.assetId ? ids.get(layer.assetId)! : null,
      mask: layer.mask
        ? {
            ...layer.mask,
            ...(layer.mask.assetId ? { assetId: ids.get(layer.mask.assetId)! } : {}),
            ...(layer.mask.layerId ? { layerId: ids.get(layer.mask.layerId)! } : {}),
          }
        : null,
      effects: layer.effects.map((effect) => ({ ...effect, id: ids.get(effect.id)! })),
      ...(layer.guides
        ? { guides: layer.guides.map((guide) => ({ ...guide, id: ids.get(guide.id)! })) }
        : {}),
    })),
  };
  const locks = cloned.layers
    .filter((layer) => layer.locked)
    .map((layer) => ({ id: layer.id, patch: { locked: true } }));
  return content.kind === "composition"
    ? {
        commands: [
          ...(assets.length ? [{ type: "addAssets" as const, assets }] : []),
          { type: "addPage", page: cloned },
        ],
        selection: [],
        pageId: cloned.id,
      }
    : {
        commands: [
          {
            type: "addLayers",
            layers: cloned.layers.map((layer) =>
              layer.locked ? { ...layer, locked: false } : layer,
            ),
            ...(assets.length ? { assets } : {}),
          },
          ...(locks.length ? [{ type: "updateLayerPatches" as const, patches: locks }] : []),
        ],
        selection: content.selection.map((id) => ids.get(id)!),
      };
}
