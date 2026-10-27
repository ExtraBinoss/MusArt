import { it, expect } from "vitest";
import { setup, box } from "../support/fixture";
import { getLayer, selectedRoots, assertEditable } from "../../src/layers/access";
it("resolves editable selection roots and rejects locked ancestors", () => {
  const group = box("group", 0, 0, { kind: "group" }),
    child = box("child", 0, 0, { parentId: "group" });
  const { page } = setup([group, child]);
  expect(selectedRoots(page(), ["group", "child", "child"]).map((layer) => layer.id)).toEqual([
    "group",
  ]);
  expect(() => getLayer(page(), "absent")).toThrow();
  group.locked = true;
  expect(() => assertEditable({ ...page(), layers: [group, child] }, child)).toThrow("verrouillé");
  assertEditable({ ...page(), layers: [group, child] }, group, true);
});
