import { expect, test } from "vitest";
import { createLayer } from "@musart/core";
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
