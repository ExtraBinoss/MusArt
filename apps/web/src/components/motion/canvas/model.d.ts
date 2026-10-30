import type { Asset, MotionAudioTrack, MotionEasing, MotionTime } from "@musart/core";
import type { TimelineRow } from "../tree";

/** All coordinates are CSS pixels. x=0 is after the HTML gutter; y=0 is below the ruler. */
export interface TimelineCanvasViewport {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}
export interface TimelineCanvasRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface TimelineCanvasDraft {
  readonly action: "keys" | "move" | "trimStart" | "trimEnd";
  readonly delta: MotionTime;
  readonly trackId?: string;
  readonly trackIds?: ReadonlySet<string>;
  readonly boundary?: "start" | "end" | null;
  readonly keyIds: ReadonlySet<string>;
  readonly layerIds: ReadonlySet<string>;
}
export interface TimelineCanvasAudioDraft {
  readonly trackId: string;
  readonly start: number;
  readonly end: number;
  readonly sourceIn: number;
}
export interface TimelineCanvasSelectionPreview {
  readonly ranges: readonly {
    readonly propertyId: string;
    readonly first: number;
    readonly after: number;
  }[];
  readonly base: ReadonlySet<string>;
}
export interface TimelineCanvasRowPose {
  /** Authored-body coordinate, including the current native WAAPI transform. */
  readonly top: number;
  readonly height: number;
  readonly zIndex: number;
  readonly order: number;
}
export interface TimelineCanvasModel {
  readonly rows: readonly TimelineRow[];
  readonly audioTracks: readonly MotionAudioTrack[];
  readonly assets: Readonly<Record<string, Asset>>;
  readonly selectedLayerIds: ReadonlySet<string>;
  readonly selectedAudioTrackIds?: ReadonlySet<string>;
  readonly selectedKeyIds: ReadonlySet<string>;
  readonly scale: number;
  readonly duration: number;
  readonly rowHeight: number;
  readonly gutter: number;
  readonly draft?: TimelineCanvasDraft | null;
  readonly audioDraft?: TimelineCanvasAudioDraft | null;
  readonly selectionPreview?: TimelineCanvasSelectionPreview | null;
  readonly rowPositions?: ReadonlyMap<string, TimelineCanvasRowPose> | null;
  readonly hoverHit?: TimelineCanvasHit | null;
  /** Normalized absolute peaks, prepared outside the painter; indexed by audio track ID. */
  readonly waveformPeaks?: ReadonlyMap<string, readonly number[]>;
}
interface TimelineCanvasHitBase {
  readonly rowKey: string;
  readonly rowIndex: number;
  readonly bounds: TimelineCanvasRect;
}
type VisualHitKind = "clip" | "trimStart" | "trimEnd";
type AudioHitKind = "audio" | "audioTrimStart" | "audioTrimEnd";
type VisualCanvasHit = {
  [Kind in VisualHitKind]: TimelineCanvasHitBase & {
    readonly kind: Kind;
    readonly layerId: string;
    readonly trackId: string;
  };
}[VisualHitKind];
type AudioCanvasHit = {
  [Kind in AudioHitKind]: TimelineCanvasHitBase & {
    readonly kind: Kind;
    readonly trackId: string;
  };
}[AudioHitKind];
export type TimelineCanvasHit =
  | VisualCanvasHit
  | (TimelineCanvasHitBase & {
      readonly kind: "key";
      readonly layerId: string;
      readonly trackId: string;
      readonly propertyId: string;
      readonly keyId: string;
      /** A dense bucket is represented by indices rather than copying arbitrarily many IDs. */
      readonly firstKeyIndex: number;
      readonly afterKeyIndex: number;
    })
  | (TimelineCanvasHitBase & {
      readonly kind: "easing";
      readonly layerId: string;
      readonly trackId: string;
      readonly propertyId: string;
      readonly keyId: string;
      readonly previousKeyId: string;
    })
  | AudioCanvasHit
  | (TimelineCanvasHitBase & {
      readonly kind: "gap";
      readonly layerId: string;
      readonly start: number;
      readonly end: number;
    });
export interface TimelineCanvasClip {
  readonly kind: "clip" | "audio";
  readonly hit: TimelineCanvasHit;
  readonly bounds: TimelineCanvasRect;
  readonly selected: boolean;
  readonly media: boolean;
  readonly mediaKind: "image" | "video" | "audio" | "other";
  readonly muted: boolean;
  readonly label: string;
  readonly peaks?: readonly number[];
  readonly sourceIn: number;
  readonly sourceDuration: number;
  readonly duration: number;
  readonly trims: readonly TimelineCanvasHit[];
}
export interface TimelineCanvasKey {
  readonly kind: "key";
  readonly hit: Extract<TimelineCanvasHit, { kind: "key" }>;
  readonly bounds: TimelineCanvasRect;
  readonly selected: boolean;
  readonly count: number;
}
export interface TimelineCanvasEasing {
  readonly kind: "easing";
  readonly hit: Extract<TimelineCanvasHit, { kind: "easing" }>;
  readonly bounds: TimelineCanvasRect;
  readonly easing?: MotionEasing;
}
export interface TimelineCanvasRow {
  readonly key: string;
  readonly index: number;
  readonly y: number;
  readonly selected: boolean;
  readonly items: readonly (TimelineCanvasClip | TimelineCanvasKey | TimelineCanvasEasing)[];
  readonly gaps: readonly Extract<TimelineCanvasHit, { kind: "gap" }>[];
}
export interface TimelineCanvasScene {
  readonly viewport: TimelineCanvasViewport;
  readonly rowHeight: number;
  readonly rows: readonly TimelineCanvasRow[];
  readonly hoverHit: TimelineCanvasHit | null;
  readonly easingDisabled?: boolean;
}
export interface TimelineCanvasPalette {
  readonly background: string;
  readonly foreground: string;
  readonly muted: string;
  readonly border: string;
  readonly track: string;
  readonly trackHover: string;
  readonly trackSelected: string;
  readonly keySelected: string;
  readonly image: string;
  readonly video: string;
  readonly audio: string;
}
export interface TimelineCanvasSurface {
  update(model: TimelineCanvasModel): void;
  invalidate(): void;
  hitTest(x: number, y: number): TimelineCanvasHit | null;
  dispose(): void;
}
