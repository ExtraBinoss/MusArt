import { expect, it } from "vitest";
import { createProject, EditorEngine } from "@musart/core";
import { createQuickAddItems } from "../../../src/canvas/quick-add/catalog";
import { createSearchCommandItems } from "../../../src/components/search/catalog/items";
it("uses the shared registry's addable items without project navigation, layers, effects or destructive actions", () => {
  const snapshot = new EditorEngine(createProject()).getSnapshot(),
    t = (key: string) => key;
  const items = createQuickAddItems(snapshot, t),
    registry = createSearchCommandItems(snapshot, t);
  expect(items.map((item) => item.id)).toEqual([
    "action:toolShape",
    "action:toolText",
    "action:toolRectangle",
    "action:toolEllipse",
    "action:importImages",
    "action:importSvg",
    "action:addPage",
    "action:addTechnoArtboard",
  ]);
  for (const item of items) expect(item).toEqual(registry.find((entry) => entry.id === item.id));
});
