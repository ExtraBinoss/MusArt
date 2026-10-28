import { expect, test } from "vitest";
import { createEffect, createLayer } from "@musart/core";
import { layerSelection } from "../../../../src/components/layers/menu/selection";
import { setup } from "../../../support/ui";
test("derives sibling grouping, pristine-group ungrouping and ancestor lock state", () => {
  const d = setup(),
    g = createLayer("group", { id: "g" }),
    child = { ...d.rectangle, parentId: "g" },
    page = { ...d.page, layers: [g, child, d.text] };
  expect(layerSelection(page, [])).toMatchObject({
    editable: false,
    canGroup: false,
    canUngroup: false,
  });
  expect(layerSelection(page, [g.id])).toMatchObject({ ungroup: true, canUngroup: true });
  expect(layerSelection(page, [g.id, child.id]).roots.map((layer) => layer.id)).toEqual([g.id]);
  expect(layerSelection(page, [g.id, d.text.id]).canGroup).toBe(true);
  expect(layerSelection(page, [child.id, d.text.id]).canGroup).toBe(false);
  expect(
    layerSelection({ ...page, layers: [{ ...g, locked: true }, child] }, [child.id]).editable,
  ).toBe(false);
  expect(
    layerSelection({ ...page, layers: [{ ...g, opacity: 0.5 }, child] }, [g.id]).canUngroup,
  ).toBe(false);
  expect(layerSelection({ ...page, layers: [g, child] }, [child.id]).editable).toBe(true);
});

test("a deep selected hierarchy resolves one root without quadratic ancestor walks", () => {
  const d = setup(),
    layers = Array.from({ length: 10000 }, (_, at) =>
      createLayer("group", { id: `deep-${at}`, parentId: at ? `deep-${at - 1}` : null }),
    );
  const state = layerSelection(
    { ...d.page, layers },
    layers.map((layer) => layer.id),
  );
  expect(state.roots.map((layer) => layer.id)).toEqual(["deep-0"]);
  expect(state.selected).toHaveLength(10000);
  expect(state.canUngroup).toBe(true);
});

test("all consumers share one immutable analysis for the canonical page and selection", () => {
  const d = setup();
  d.engine.select([d.rectangle.id, d.text.id]);
  const snapshot = d.engine.getSnapshot(),
    page = snapshot.project.pages[0]!,
    first = layerSelection(page, snapshot.selection);
  expect(layerSelection(page, snapshot.selection)).toBe(first);
  expect(Object.isFrozen(first.selected)).toBe(true);
  expect(Object.isFrozen(first.roots)).toBe(true);
  expect(() => Array.prototype.push.call(first.selected, d.image)).toThrow();
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } });
  expect(layerSelection(d.engine.getSnapshot().project.pages[0]!, snapshot.selection)).not.toBe(
    first,
  );
  expect(
    layerSelection(d.engine.getSnapshot().project.pages[0]!, snapshot.selection).editable,
  ).toBe(false);
});

test("mutable selections and shallow-frozen effect arrays cannot retain stale predicates", () => {
  const d = setup(),
    group = createLayer("group"),
    selection = [group.id],
    page = { ...d.page, layers: [group] };
  expect(layerSelection(page, selection).canUngroup).toBe(true);
  group.locked = true;
  expect(layerSelection(page, selection).editable).toBe(false);
  group.locked = false;
  Object.freeze(group);
  Object.freeze(page.layers);
  Object.freeze(page);
  Object.freeze(selection);
  expect(layerSelection(page, selection).canUngroup).toBe(true);
  group.effects.push(createEffect("blur"));
  expect(layerSelection(page, selection).canUngroup).toBe(false);
});
