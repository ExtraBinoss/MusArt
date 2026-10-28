import type { Layer, LayoutReference } from "@musart/core";
/** Sibling children use their group; roots use selection bounds; mixed hierarchies use safe page/world bounds. */
export function alignmentReference(selected: readonly Layer[]): LayoutReference {
  if (selected.length < 2) return selected[0]?.parentId ? "parent" : "page";
  const parent = selected[0]!.parentId;
  if (selected.every((layer) => layer.parentId === parent)) return parent ? "parent" : "selection";
  return "page";
}
