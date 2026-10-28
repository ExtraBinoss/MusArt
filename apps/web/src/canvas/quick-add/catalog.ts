import type { SessionSnapshot } from "@musart/core";
import { createSearchCommandItems } from "../../components/search/catalog/items";
import type { SearchAction, SearchTranslate } from "../../components/search/catalog/model";

const ADDABLE = new Set<SearchAction>([
  "importImages",
  "importSvg",
  "toolText",
  "toolShape",
  "toolRectangle",
  "toolEllipse",
  "addPage",
  "addTechnoArtboard",
]);

/** A capability filter over Magic Search's catalogue, never a second command catalogue. */
export function createQuickAddItems(snapshot: SessionSnapshot, t: SearchTranslate) {
  return createSearchCommandItems(snapshot, t).filter(
    (item) => item.target.kind === "action" && ADDABLE.has(item.target.action),
  );
}
