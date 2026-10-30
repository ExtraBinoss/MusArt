import type { Composition } from "../document/model";
import { cloneValue } from "../document/immutable";
import { resolveMotionProperty } from "./properties/registry";

/** Duplicate temporal data with the canonical graph's already allocated identities. */
export function duplicateMotionTracks(
  page: Composition,
  layerIds: ReadonlyMap<string, string>,
  effectIds: ReadonlyMap<string, string>,
  offsetRoots: ReadonlySet<string>,
  nextId: (prefix: string) => string,
): void {
  if (!page.motion) return;
  const additions = page.motion.tracks
    .filter((track) => layerIds.has(track.layerId))
    .map((track) => {
      const duplicate = cloneValue(track);
      duplicate.id = nextId("track");
      duplicate.layerId = layerIds.get(track.layerId)!;
      for (const animation of duplicate.animations ?? []) {
        animation.id = nextId("animation");
        animation.effectIds = animation.effectIds.map((id) => effectIds.get(id)!);
      }
      for (const property of duplicate.properties) {
        property.id = nextId("property");
        property.target =
          property.target.kind === "layer"
            ? { ...property.target, layerId: duplicate.layerId }
            : {
                ...property.target,
                layerId: duplicate.layerId,
                effectId: effectIds.get(property.target.effectId)!,
              };
        for (const key of property.keyframes) {
          key.id = nextId("key");
          // Duplicate's spatial offset must also apply to its authored positions.
          if (
            offsetRoots.has(track.layerId) &&
            property.target.kind === "layer" &&
            (property.target.property === "x" || property.target.property === "y") &&
            typeof key.value === "number"
          )
            key.value += 24;
        }
      }
      return duplicate;
    });
  page.motion.tracks.push(...additions);
}

/** Effect removal/type changes cannot strand animation targets in an otherwise valid edit. */
export function pruneMotionProperties(page: Composition): void {
  if (!page.motion) return;
  let changed = false;
  const tracks = page.motion.tracks.map((track) => {
    const properties = track.properties.filter(({ target }) => resolveMotionProperty(page, target));
    const layer = page.layers.find((layer) => layer.id === track.layerId);
    const animations = track.animations?.filter((animation) =>
      animation.effectIds.every((id) => layer?.effects.some((effect) => effect.id === id)),
    );
    if (
      properties.length === track.properties.length &&
      animations?.length === track.animations?.length
    )
      return track;
    changed = true;
    return { ...track, properties, ...(animations ? { animations } : {}) };
  });
  if (changed) page.motion = { ...page.motion, tracks };
}
