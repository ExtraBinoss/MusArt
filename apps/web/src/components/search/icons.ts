import {
  MousePointer2,
  Import,
  FolderOpen,
  Undo2,
  ScanEye,
  PanelsTopLeft,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Settings2,
  Keyboard,
  Hand,
  Shapes,
  Square,
  Circle,
  Type,
  WandSparkles,
  Scan,
  Plus,
  Wallpaper,
  Redo2,
  Magnet,
  Move,
} from "lucide-react";
import type { SearchItem } from "./catalog/model";

const categories = {
  tools: MousePointer2,
  files: Import,
  project: FolderOpen,
  edit: Undo2,
  view: ScanEye,
  pages: PanelsTopLeft,
  layers: Layers,
  effects: Sparkles,
  adjustments: SlidersHorizontal,
  preferences: Settings2,
  help: Keyboard,
};
const actions = {
  toolPointer: MousePointer2,
  toolHand: Hand,
  toolShape: Shapes,
  toolRectangle: Square,
  toolEllipse: Circle,
  toolText: Type,
  toolWand: WandSparkles,
  toolSegment: Scan,
  addPage: Plus,
  addTechnoArtboard: Wallpaper,
  redo: Redo2,
  editorSettings: Settings2,
  enableSnapping: Magnet,
  disableSnapping: Move,
};
export function getSearchIcon(item: Pick<SearchItem, "target" | "category">) {
  return item.target.kind === "action" && item.target.action in actions
    ? actions[item.target.action as keyof typeof actions]
    : categories[item.category];
}
