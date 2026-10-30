import {
  getMotionOccurrenceAt,
  isPublishedComposition,
  listLayerMotionOccurrences,
  type Composition,
  type MotionPropertyTarget,
  type MotionPropertyTrack,
  type MotionTime,
} from "@musart/core";

export interface MotionPropertyScope {
  time?: MotionTime;
  trackId?: string;
}
export const motionTargetKey = (target: MotionPropertyTarget): string =>
  JSON.stringify([
    target.kind,
    target.layerId,
    target.kind === "layer" ? "" : target.effectId,
    target.property,
  ]);

const indexes = new WeakMap<Composition, ReadonlyMap<string, MotionPropertyTrack>>();
const propertyKey = (trackId: string, target: MotionPropertyTarget) =>
  JSON.stringify([trackId, motionTargetKey(target)]);

function propertyIndex(page: Composition): ReadonlyMap<string, MotionPropertyTrack> {
  const published = isPublishedComposition(page);
  const retained = published ? indexes.get(page) : undefined;
  if (retained) return retained;
  const index = new Map(
    page.motion?.tracks.flatMap((track) =>
      track.properties.map(
        (property) => [propertyKey(track.id, property.target), property] as const,
      ),
    ) ?? [],
  );
  if (published) indexes.set(page, index);
  return index;
}

/** An explicit occurrence or exact playhead is required for repeated layers. */
export function motionPropertyTrack(
  page: Composition,
  target: MotionPropertyTarget,
  scope: MotionPropertyScope = {},
): MotionPropertyTrack | undefined {
  const tracks = listLayerMotionOccurrences(page, target.layerId);
  const track =
    scope.trackId !== undefined
      ? tracks.find((item) => item.id === scope.trackId)
      : scope.time
        ? getMotionOccurrenceAt(page, target.layerId, scope.time, { terminalPreview: true })
        : tracks.length === 1
          ? tracks[0]
          : undefined;
  return track ? propertyIndex(page).get(propertyKey(track.id, target)) : undefined;
}
export function hasMotionKeys(
  page: Composition,
  target: MotionPropertyTarget,
  scope: MotionPropertyScope = {},
): boolean {
  return Boolean(motionPropertyTrack(page, target, scope)?.keyframes.length);
}
