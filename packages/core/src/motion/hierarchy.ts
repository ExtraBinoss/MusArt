import type { Composition } from "../document/model";
import { ensure } from "../errors";
import { getAncestors, getDescendants } from "../layers/geometry";

/** A hierarchy rewrite must not silently reinterpret parent-local animated values.
 * Until timed transform baking is available, fail atomically for affected animation. */
export function assertMotionHierarchyChange(page: Composition, layerIds: string[]): void {
  if (!page.motion) return;
  const affected = new Set(layerIds);
  for (const layer of getDescendants(page, layerIds)) affected.add(layer.id);
  for (const id of layerIds)
    for (const ancestor of getAncestors(page, id)) affected.add(ancestor.id);
  const changesAnimation = page.motion.tracks.some(
    (track) =>
      affected.has(track.layerId) &&
      (track.start.value !== 0 ||
        track.end !== null ||
        track.properties.some((property) => property.keyframes.length > 0)),
  );
  ensure(
    !changesAnimation,
    "INVALID_COMMAND",
    "Animated hierarchy changes require transform baking; keep the current group structure.",
  );
}
