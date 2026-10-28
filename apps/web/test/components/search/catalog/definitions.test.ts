import { expect, test } from "vitest";
import { ACTIONS } from "../../../../src/components/search/catalog/definitions";
test("provides one shared localized definition for every searchable action", () => {
  expect(new Set(ACTIONS.map((action) => action.action)).size).toBe(ACTIONS.length);
  expect(ACTIONS.every((action) => action.label && action.terms && action.category)).toBe(true);
  expect(ACTIONS.find((action) => action.action === "save")?.shortcut).toEqual(["Mod", "S"]);
  for (const action of ["editorSettings", "enableSnapping", "disableSnapping"])
    expect(ACTIONS.find((item) => item.action === action)).toMatchObject({
      category: "preferences",
    });
});
