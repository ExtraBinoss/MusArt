import { expect, test } from "vitest";
import { createStore } from "jotai";
import { SHAPE_CATALOG, type CatalogAsset } from "@musart/assets";
import { shapeChoiceAtom, vectorFromAsset } from "../../../src/components/assets/selection";
test("keeps chosen artwork in presentation state while document geometry stays portable", () => {
  const store = createStore();
  expect(store.get(shapeChoiceAtom)).toEqual(SHAPE_CATALOG[0]);
  const second: CatalogAsset = SHAPE_CATALOG[1]!;
  store.set(shapeChoiceAtom, second);
  expect(store.get(shapeChoiceAtom)).toBe(second);
  const vector = vectorFromAsset({ ...second, name: "Human label", attribution: "Credits" });
  expect(vector).toEqual({
    viewBox: second.viewBox,
    path: second.path,
    parts: second.parts,
    strokeOnly: second.strokeOnly,
    attribution: "Credits",
    preserveColors: false,
  });
  expect(vector).not.toHaveProperty("id");
  expect(vector).not.toHaveProperty("name");
});

test("preserves original paints for multipart branded or imported artwork", () => {
  expect(
    vectorFromAsset({
      id: "brand-test",
      name: "Brand",
      viewBox: "0 0 24 24",
      parts: [{ path: "M0 0H24V24Z", fill: "#ff0000" }],
    }).preserveColors,
  ).toBe(true);
  expect(
    vectorFromAsset({
      id: "custom",
      name: "Shape",
      viewBox: "0 0 24 24",
      preserveColors: false,
      parts: [{ path: "M0 0H24V24Z", fill: "#ff0000" }],
    }).preserveColors,
  ).toBe(false);
});
