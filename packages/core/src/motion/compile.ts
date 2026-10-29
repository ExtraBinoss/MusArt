import { isVideoAsset } from "../assets/identity";
import type { Composition, Project } from "../document/model";
import { cloneValue, freezeValue } from "../document/immutable";
import { validateProject } from "../document/validation";
import { ensure } from "../errors";
import { compileMotionInterpolator } from "./interpolation";
import type { MotionPropertyTrack } from "./model";
import type { MotionPropertyTarget, MotionValue } from "./properties/model";
import { resolveMotionProperty } from "./properties/registry";
import { addMotionTime, compareMotionTime, type MotionTime } from "./time";

export interface CompiledMotionProperty {
  readonly target: MotionPropertyTarget;
  readonly keys: readonly { readonly time: MotionTime; readonly value: MotionValue }[];
  /** Segment n maps key n to key n+1 using the destination key's easing. */
  readonly segments: readonly ((progress: number) => MotionValue)[];
}

export interface CompiledMotionLayer {
  readonly id: string;
  readonly start: MotionTime;
  readonly end: MotionTime | null;
  readonly properties: readonly CompiledMotionProperty[];
  readonly media?: {
    readonly assetId: string;
    readonly sourceStart: MotionTime;
    readonly timelineStart: MotionTime;
    readonly mute: boolean;
    readonly volume: number;
  };
}

export interface MotionProgram {
  readonly compositionId: string;
  /** A private deep-frozen copy of the authored composition, never a caller-owned reference. */
  readonly composition: Composition;
  readonly mode: "static" | "motion";
  readonly duration: MotionTime | null;
  readonly layers: readonly CompiledMotionLayer[];
}

function compileProperty(page: Composition, property: MotionPropertyTrack): CompiledMotionProperty {
  const descriptor = resolveMotionProperty(page, property.target);
  ensure(descriptor, "INVALID_DOCUMENT", "Unknown Motion property.");
  return {
    target: descriptor.target,
    keys: property.keyframes.map((key) => ({ time: key.time, value: key.value })),
    segments: property.keyframes
      .slice(1)
      .map((key, index) =>
        compileMotionInterpolator(
          descriptor,
          property.keyframes[index]!.value,
          key.value,
          key.easing,
        ),
      ),
  };
}

/** Cold compilation owns validation/copying. Frame evaluation never visits project validation. */
export function compileMotion(
  project: Project,
  options: { readonly compositionId: string },
): MotionProgram {
  validateProject(project);
  const authored = project.pages.find((page) => page.id === options.compositionId);
  ensure(authored, "NOT_FOUND", "Motion composition not found.");
  const page = cloneValue(authored);
  const mode = page.motion?.mode ?? "static";
  const duration = page.motion?.duration ?? null;
  const byId = new Map(page.layers.map((layer) => [layer.id, layer]));
  const tracks = new Map(page.motion?.tracks.map((track) => [track.layerId, track]) ?? []);
  const zero: MotionTime = { value: 0, rate: 1 };
  const layers = page.layers.map((layer): CompiledMotionLayer => {
    let start = zero;
    let end = duration;
    if (mode === "motion") {
      let current: typeof layer | undefined = layer;
      while (current) {
        const track = tracks.get(current.id);
        if (track) {
          if (compareMotionTime(track.start, start) > 0) start = track.start;
          if (track.end !== null && (end === null || compareMotionTime(track.end, end) < 0))
            end = track.end;
        }
        current = current.parentId === null ? undefined : byId.get(current.parentId);
      }
    }
    const track = tracks.get(layer.id);
    const asset = layer.assetId ? project.assets[layer.assetId] : undefined;
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
    return {
      id: layer.id,
      ...(media ? { media } : {}),
      start,
      end,
      properties:
        mode === "motion"
          ? (tracks.get(layer.id)?.properties ?? [])
              .filter((property) => property.keyframes.length > 0)
              .map((property) => compileProperty(page, property))
          : [],
    };
  });
  return freezeValue({ compositionId: page.id, composition: page, mode, duration, layers });
}
