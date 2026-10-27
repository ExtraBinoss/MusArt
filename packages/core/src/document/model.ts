/** Portable document contract. No browser, React or renderer dependencies. */
export const FORMAT_VERSION = 1 as const;
export type LayerKind = "rectangle" | "ellipse" | "text" | "image" | "group";
export type EffectType = "dither" | "ascii" | "brightness" | "contrast" | "grayscale" | "blur";
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
  assetId: string;
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
  blendMode: "normal" | "multiply" | "screen" | "overlay";
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
  | { type: "addGuide"; guide: Guide }
  | { type: "deleteGuide"; id: string }
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
