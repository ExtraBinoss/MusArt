import { compileAnimations } from "./animations/compile";
import { getEffectDefinition } from "../effects/catalog";
import { isVideoAsset } from "../assets/identity";
import type { Asset } from "../assets/model";
import type { Composition } from "../document/model";
import { cloneValue } from "../document/immutable";
import { ensure } from "../errors";
import type { CompiledMotionLayer, CompiledMotionProperty } from "./compile";
import type { MotionLayerTrack, MotionPropertyTrack } from "./model";
import { intersectMotionIntervals, type MotionInterval } from "./intervals";
import { addMotionTime, compareMotionTime, type MotionTime } from "./time";

/** Occurrences remain disjoint temporal segments of one canonical layer and z-order. */
export function compileMotionLayers(
  page: Composition,
  assets: Readonly<Record<string, Asset>>,
  compileProperty: (page: Composition, property: MotionPropertyTrack) => CompiledMotionProperty,
): CompiledMotionLayer[] {
  const mode = page.motion?.mode ?? "static",
    duration = page.motion?.duration ?? null,
    zero: MotionTime = { value: 0, rate: 1 };
  const byId = new Map(page.layers.map((layer) => [layer.id, layer]));
  const tracks = new Map<string, MotionLayerTrack[]>();
  for (const track of page.motion?.tracks ?? []) {
    const siblings = tracks.get(track.layerId) ?? [];
    siblings.push(track);
    tracks.set(track.layerId, siblings);
  }
  for (const siblings of tracks.values())
    siblings.sort((a, b) => compareMotionTime(a.start, b.start));
  const implicit = page.motion?.version !== 2;
  let segments = 0;
  const interval = (track?: MotionLayerTrack): MotionInterval[] => {
    const start = track?.start ?? zero,
      end = track?.end ?? duration;
    return end && compareMotionTime(start, end) < 0 ? [{ start, end }] : [];
  };
  const presence = (id: string): MotionInterval[] => {
    const siblings = tracks.get(id);
    return siblings ? siblings.flatMap((track) => interval(track)) : implicit ? interval() : [];
  };
  return page.layers.flatMap((layer): CompiledMotionLayer[] => {
    const authored = tracks.get(layer.id);
    const occurrences =
      mode === "static" ? [undefined] : (authored ?? (implicit ? [undefined] : []));
    return occurrences.flatMap((track): CompiledMotionLayer[] => {
      const properties =
        mode === "motion"
          ? (track?.properties ?? [])
              .filter((property) => property.keyframes.length > 0)
              .map((property) => compileProperty(page, property))
          : [];
      const asset = layer.assetId ? assets[layer.assetId] : undefined;
      const media =
        layer.kind === "video" && asset && isVideoAsset(asset)
          ? {
              assetId: asset.id,
              sourceStart:
                mode === "motion"
                  ? addMotionTime(asset.firstTimestamp, track?.media?.sourceIn ?? zero)
                  : cloneValue(asset.firstTimestamp),
              timelineStart: mode === "motion" ? (track?.start ?? zero) : zero,
              mute: mode === "motion" ? (track?.media?.mute ?? false) : true,
              volume: mode === "motion" ? (track?.media?.volume ?? 1) : 0,
            }
          : undefined;
      let windows = interval(track);
      if (mode === "motion" && duration) {
        windows = intersectMotionIntervals(windows, [{ start: zero, end: duration }]);
        let parent = layer.parentId;
        while (parent !== null && windows.length) {
          windows = intersectMotionIntervals(windows, presence(parent));
          parent = byId.get(parent)!.parentId;
        }
      }
      const common = {
        ...(mode === "motion" &&
        layer.effects.some((effect) => getEffectDefinition(effect.type).source === "geometry")
          ? {
              geometrySources: layer.effects
                .filter((effect) => getEffectDefinition(effect.type).source === "geometry")
                .map((effect) => {
                  const owner = track?.animations?.find((animation) =>
                    animation.effectIds.includes(effect.id),
                  );
                  const owned = authored?.some((occurrence) =>
                    occurrence.animations?.some((animation) =>
                      animation.effectIds.includes(effect.id),
                    ),
                  );
                  return {
                    effectId: effect.id,
                    start: owner?.start ?? zero,
                    enabled: effect.enabled && (owner ? owner.enabled : !owned),
                  };
                }),
            }
          : {}),
        id: layer.id,
        ...(track ? { trackId: track.id } : {}),
        ...(media ? { media } : {}),
        ...(mode === "motion" && authored && authored.length > 1 && track
          ? {
              propertyScope: { start: track.start, end: track.end ?? duration },
            }
          : {}),
        properties,
        ...(mode === "motion" && track?.animations?.length
          ? { animations: compileAnimations(page, track) }
          : {}),
      };
      if (mode === "static") return [{ ...common, start: zero, end: duration }];
      // Keep an inactive single segment so legacy off-range property sampling remains defined.
      const effective = windows.length ? windows : [{ start: zero, end: zero }];
      segments += effective.length;
      ensure(
        segments <= 100000,
        "INVALID_DOCUMENT",
        "Motion temporal segments exceed compilation budget",
      );
      return effective.map((window) => ({ ...common, ...window }));
    });
  });
}
