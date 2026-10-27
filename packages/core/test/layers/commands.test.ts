import { it, expect } from "vitest";
import { setup, box } from "../support/fixture";
it("duplicates groups with fresh guides/effects and remaps internal mask references", () => {
  const group = box("g", 0, 0, { kind: "group" }),
    source = box("source", 0, 0, {
      parentId: "g",
      maskSource: true,
      guides: [{ id: "local", axis: "x", position: 5 }],
    }),
    target = box("target", 0, 0, {
      parentId: "g",
      mask: { layerId: "source", enabled: true, inverted: false },
    });
  const { engine, page } = setup([group, source, target]);
  engine.execute({ type: "duplicateLayers", ids: ["g"] });
  const cloneGroup = engine.getSnapshot().selection[0]!,
    clones = page().layers.filter((layer) => layer.parentId === cloneGroup),
    cloneSource = clones.find((layer) => layer.maskSource)!,
    cloneTarget = clones.find((layer) => layer.mask)!;
  expect(cloneSource.id).not.toBe(source.id);
  expect(cloneSource.guides![0]!.id).not.toBe("local");
  expect(cloneTarget.mask!.layerId).toBe(cloneSource.id);
  engine.execute({ type: "updateLayers", ids: [cloneTarget.id], patch: { mask: null } });
  expect(page().layers.find((layer) => layer.id === cloneSource.id)!.maskSource).toBe(false);
});
