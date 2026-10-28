import type { EffectType } from "@musart/core";

export const SEARCH_CATEGORIES = [
  "tools",
  "files",
  "project",
  "edit",
  "view",
  "pages",
  "layers",
  "effects",
  "adjustments",
  "preferences",
  "help",
] as const;
export type SearchCategory = (typeof SEARCH_CATEGORIES)[number];
export type SearchFilter = SearchCategory | "all";
export type SearchAction =
  | "toolPointer"
  | "toolHand"
  | "toolShape"
  | "toolRectangle"
  | "toolEllipse"
  | "toolText"
  | "toolWand"
  | "toolSegment"
  | "importImages"
  | "importSvg"
  | "openPortable"
  | "exportImage"
  | "exportProject"
  | "projects"
  | "newProject"
  | "save"
  | "addPage"
  | "addTechnoArtboard"
  | "undo"
  | "redo"
  | "duplicate"
  | "copy"
  | "paste"
  | "copyComposition"
  | "delete"
  | "group"
  | "ungroup"
  | "selectAll"
  | "deselect"
  | "toggleVisibility"
  | "toggleLock"
  | "fit"
  | "reset"
  | "recenter"
  | "zoomIn"
  | "zoomOut"
  | "rulers"
  | "design"
  | "animate"
  | "settings"
  | "editorSettings"
  | "enableSnapping"
  | "disableSnapping"
  | "themeLight"
  | "themeDark"
  | "themeSystem"
  | "languageEnglish"
  | "languageFrench"
  | "shortcuts";
export type SearchTarget =
  | { kind: "action"; action: SearchAction }
  | { kind: "page"; pageId: string }
  | { kind: "layer"; pageId: string; layerId: string }
  | { kind: "effect"; effect: EffectType };
export interface SearchItem {
  id: string;
  label: string;
  category: SearchCategory;
  target: SearchTarget;
  terms: string;
  detail?: string;
  shortcut?: string[];
  disabled?: string;
}
export type SearchTranslate = (key: string, values?: Record<string, unknown>) => string;
