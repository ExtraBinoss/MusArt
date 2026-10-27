import type { BlendMode } from "../layers/blending/catalog";
import type { VectorDefinition } from "../vector/model";
import type { Insets, WorkingColorSpace, Alignment, LayoutReference } from "../layout/model";
import type { ReplaySpec } from "../animation/model";
/** Portable document contract. No browser, React or renderer dependencies. */
export const FORMAT_VERSION = 1 as const;
export type LayerKind = "rectangle" | "ellipse" | "text" | "image" | "group" | "vector";
export type EffectType =
  | "dither"
  | "ascii"
  | "brightness"
  | "contrast"
  | "grayscale"
  | "blur"
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
  | "vignette";
export interface Effect {
  id: string;
  type: EffectType;
  enabled: boolean;
  amount: number;
  scale: number;
  levels: number;
  color: boolean;
  seed: number;
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
  opacity: number;
  visible: boolean;
  locked: boolean;
  fill: string;
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
}
export interface Asset {
  id: string;
  name: string;
  mime: string;
  width: number;
  height: number;
  dataUrl: string;
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
  | { type: "addLayers"; layers: Layer[]; assets?: Asset[] }
  | { type: "updateLayers"; ids: string[]; patch: Partial<Layer> }
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
}
