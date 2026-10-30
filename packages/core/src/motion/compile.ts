import type { CompiledAnimationChannel } from "./animations/compile";
import type { Composition, Project } from "../document/model";
import { cloneValue, freezeValue } from "../document/immutable";
import { validateProject } from "../document/validation";
import { ensure } from "../errors";
import { compileMotionLayers } from "./compile-layers";
import { compileMotionInterpolator } from "./interpolation";
import type { MotionPropertyTrack } from "./model";
import type { MotionAudioProcessing } from "./audio/model";
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
  readonly geometrySources?: readonly { effectId: string; start: MotionTime; enabled: boolean }[];
  readonly id: string;
  /** Several disjoint segments may share this canonical id; trackId identifies their occurrence. */
  readonly trackId?: string;
  readonly propertyScope?: { readonly start: MotionTime; readonly end: MotionTime | null };
  readonly start: MotionTime;
  readonly end: MotionTime | null;
  readonly properties: readonly CompiledMotionProperty[];
  readonly animations?: readonly CompiledAnimationChannel[];
  readonly media?: {
    readonly assetId: string;
    readonly sourceStart: MotionTime;
    readonly timelineStart: MotionTime;
    readonly timelineEnd?: MotionTime;
    readonly mute: boolean;
    readonly volume: number;
    readonly processing?: MotionAudioProcessing;
  };
}

export interface MotionProgram {
  readonly compositionId: string;
  /** A private deep-frozen copy of the authored composition, never a caller-owned reference. */
  readonly composition: Composition;
  readonly mode: "static" | "motion";
  readonly duration: MotionTime | null;
  readonly layers: readonly CompiledMotionLayer[];
  readonly audio: readonly CompiledMotionAudio[];
}

export interface CompiledMotionAudio {
  readonly id: string;
  readonly start: MotionTime;
  readonly end: MotionTime;
  readonly media: NonNullable<CompiledMotionLayer["media"]>;
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
  const layers = compileMotionLayers(page, project.assets, compileProperty);
  const audio: CompiledMotionAudio[] =
    mode === "motion"
      ? (page.motion?.audioTracks ?? []).map((track) => {
          const asset = project.assets[track.assetId]!;
          ensure(asset.kind === "audio", "INVALID_DOCUMENT", "Audio track has no audio original");
          return {
            id: track.id,
            start: track.start,
            end: duration && compareMotionTime(track.end, duration) > 0 ? duration : track.end,
            media: {
              assetId: asset.id,
              sourceStart: addMotionTime(asset.firstTimestamp, track.sourceIn),
              timelineStart: track.start,
              timelineEnd: track.end,
              mute: track.mute,
              volume: track.volume,
              ...(track.processing ? { processing: track.processing } : {}),
            },
          };
        })
      : [];
  return freezeValue({ compositionId: page.id, composition: page, mode, duration, layers, audio });
}
