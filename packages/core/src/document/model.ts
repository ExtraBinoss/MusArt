import type { BlendMode } from "../layers/blending/catalog";
import type { VectorDefinition } from "../vector/model";
import type { Insets, WorkingColorSpace, Alignment, LayoutReference } from "../layout/model";
import type { ReplaySpec } from "../animation/model";
import type { FillGradient } from "../paint/gradient";
import type { EffectCompositeMode } from "../effects/compositing";
import type { Asset } from "../assets/model";
import type { PreparedEngineTransaction } from "../session/reservation";
export type {
  Asset,
  ImageAsset,
  VideoAsset,
  AudioAsset,
  OriginalMediaAsset,
} from "../assets/model";
import type { CompositionMotion, MotionCommand } from "../motion/model";
import type { ApplyMotionTransitionCommand } from "../motion/transitions/model";
/** Portable document contract. No browser, React or renderer dependencies. */
export const FORMAT_VERSION = 1 as const;
export type LayerKind = "rectangle" | "ellipse" | "text" | "image" | "video" | "group" | "vector";
export type EffectType =
  | "dither"
  | "ascii"
  | "brightness"
  | "contrast"
  | "grayscale"
  | "blur"
  | "shadow"
  | "saturation"
  | "hue"
  | "exposure"
  | "vibrance"
  | "temperature"
  | "tint"
  | "gamma"
  | "invert"
  | "sepia"
  | "threshold"
  | "posterize"
  | "grain"
  | "halftone"
  | "vignette"
  | "gradient"
  | "ripple"
  | "shatter"
  | "noise"
  | "flashlight"
  | "circle"
  | "cyanotype"
  | "crt"
  | "datamosh"
  | "bit-dither"
  | "receipt"
  | "pink-phosphor"
  | "transition";
/** Effect-owned scalar settings are validated against that effect's definition. */
export type EffectSettings = Partial<Record<string, number | boolean | string>>;
export interface Effect {
  id: string;
  type: EffectType;
  enabled: boolean;
  amount: number;
  scale: number;
  levels: number;
  color: boolean;
  seed: number;
  /** Missing values retain existing document semantics: normal blend and full effect opacity. */
  blendMode?: BlendMode;
  opacity?: number;
  composite?: EffectCompositeMode;
  /** Explicit seconds; still rendering never reads a wall clock. */
  time?: number;
  settings?: EffectSettings;
}
export interface LayerMask {
  assetId?: string;
  layerId?: string;
  mode?: "alpha" | "luminance";
  enabled: boolean;
  inverted: boolean;
}
export interface Layer {
  id: string;
  kind: LayerKind;
  name: string;
  parentId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** Presentation scale around the layer center; omitted means one. */
  scaleX?: number;
  scaleY?: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  fill: string;
  fillGradient?: FillGradient;
  stroke: string;
  strokeWidth: number;
  radius: number;
  blendMode: BlendMode;
  vector?: VectorDefinition;
  margin?: Insets;
  padding?: Insets;
  guides?: Guide[];
  maskSource?: boolean;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  textAlign: "left" | "center" | "right";
  assetId: string | null;
  mask: LayerMask | null;
  effects: Effect[];
}
export interface Guide {
  id: string;
  axis: "x" | "y";
  position: number;
  color?: string;
}
export interface Composition {
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  layers: Layer[];
  guides: Guide[];
  margins?: Insets;
  rulers?: boolean;
  colorSpace?: WorkingColorSpace;
  motion?: CompositionMotion;
}
export interface Project {
  version: typeof FORMAT_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  pages: Composition[];
  assets: Record<string, Asset>;
  replay?: ReplaySpec;
}
export interface SessionSnapshot {
  project: Project;
  pageId: string;
  selection: string[];
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
}
export type Command =
  | ApplyMotionTransitionCommand
  | MotionCommand
  | { type: "addLayers"; layers: Layer[]; assets?: Asset[] }
  | { type: "updateLayers"; ids: string[]; patch: Partial<Layer> }
  | { type: "updateLayerPatches"; patches: { id: string; patch: Partial<Layer> }[] }
  | { type: "deleteLayers"; ids: string[] }
  | { type: "duplicateLayers"; ids: string[] }
  | { type: "reorderLayer"; id: string; index: number; parentId?: string | null }
  | { type: "groupLayers"; ids: string[] }
  | { type: "ungroupLayers"; ids: string[] }
  | { type: "addPage"; page?: Composition }
  | { type: "updatePage"; patch: Partial<Composition> }
  | { type: "deletePage"; id: string }
  | { type: "renameProject"; name: string }
  | { type: "addGuide"; guide: Guide; targetId?: string }
  | { type: "updateGuide"; id: string; patch: Partial<Guide>; targetId?: string }
  | { type: "deleteGuide"; id: string; targetId?: string }
  | {
      type: "alignLayers";
      ids: string[];
      axis: "x" | "y";
      alignment: Alignment;
      relativeTo: LayoutReference;
    }
  | { type: "distributeLayers"; ids: string[]; axis: "x" | "y" }
  | { type: "attachLayerMask"; sourceId: string; targetId: string; mode?: "alpha" | "luminance" }
  | {
      type: "createMaskFromSelection";
      ids: string[];
      targetId?: string;
      mode?: "alpha" | "luminance";
    }
  | {
      type: "updateMask";
      targetId: string;
      patch: Partial<Pick<LayerMask, "enabled" | "inverted" | "mode">>;
    }
  | { type: "removeLayerMask"; targetId: string }
  | { type: "setReplay"; replay: ReplaySpec | null }
  | { type: "addAssets"; assets: Asset[] };
export interface EnginePort {
  getSnapshot: () => SessionSnapshot;
  subscribe: (listener: () => void) => () => void;
  execute: (command: Command) => void;
  select: (ids: string[]) => void;
  setPage: (id: string) => void;
  undo: () => void;
  redo: () => void;
  load: (project: Project) => void;
  transaction: (commands: Command[]) => void;
  reserveTransaction?: (
    commands: Command[],
    options?: { deferLock?: boolean },
  ) => PreparedEngineTransaction;
}
