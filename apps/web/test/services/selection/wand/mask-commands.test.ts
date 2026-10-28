import { expect, it } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  getWorldMatrix,
  type Asset,
} from "@musart/core";
import { selectionMaskCommands } from "../../../../src/services/selection/wand/mask-commands";

const asset = (id: string): Asset => ({
  id,
  name: "Mask",
  mime: "image/png",
  width: 3,
  height: 1,
  dataUrl: "data:image/png;base64,AAAA",
});
it("erases through an inverted selection mask in one reversible transaction without replacing original pixels", () => {
  const original = asset("original"),
    layer = createLayer("image", { id: "image", assetId: original.id }),
    engine = new EditorEngine(
      createProject({ pages: [createPage({ layers: [layer] })], assets: { original } }),
    ),
    before = engine.getSnapshot().project,
    selected = asset("selection");
  engine.select([layer.id]);
  engine.transaction(selectionMaskCommands(before.pages[0]!, layer.id, selected, true));
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.mask).toMatchObject({
    assetId: "selection",
    mode: "luminance",
    inverted: true,
    enabled: true,
  });
  expect(engine.getSnapshot().project.assets.original).toEqual(original);
  engine.undo();
  expect(engine.getSnapshot().project).toEqual(before);
  expect(engine.getSnapshot().canUndo).toBe(false);
  engine.redo();
  expect(engine.getSnapshot().project.assets.selection).toEqual(selected);
});
it.each([true, false])(
  "preserves an existing nested mask without applying parent opacity twice (erase=%s)",
  (erase) => {
    const original = asset("original"),
      oldMask = asset("old-mask"),
      group = createLayer("group", {
        id: "group",
        x: 30,
        y: 50,
        width: 300,
        height: 200,
        rotation: 35,
        opacity: 0.4,
      }),
      layer = createLayer("image", {
        id: "image",
        assetId: original.id,
        parentId: group.id,
        x: 20,
        y: 25,
        width: 60,
        height: 40,
        rotation: -15,
        mask: { assetId: oldMask.id, enabled: true, inverted: false, mode: "alpha" },
      }),
      engine = new EditorEngine(
        createProject({
          pages: [createPage({ layers: [group, layer] })],
          assets: { original, "old-mask": oldMask },
        }),
      ),
      before = engine.getSnapshot().project,
      matrix = getWorldMatrix(before.pages[0]!, layer.id);
    engine.select([layer.id]);
    engine.transaction(
      selectionMaskCommands(before.pages[0]!, layer.id, asset("selection"), erase),
    );
    const page = engine.getSnapshot().project.pages[0]!,
      target = page.layers.find((item) => item.id === layer.id)!,
      source = page.layers.find((item) => item.id === target.mask!.layerId)!;
    expect(source).toMatchObject({
      parentId: null,
      opacity: 1,
      maskSource: true,
      mask: layer.mask,
    });
    expect(source.effects.map((effect) => effect.type)).toEqual(erase ? ["invert"] : []);
    expect(target.mask).toMatchObject({ mode: "luminance", enabled: true, inverted: false });
    getWorldMatrix(page, source.id).forEach((value, index) =>
      expect(value).toBeCloseTo(matrix[index]!, 10),
    );
    expect(engine.getSnapshot().selection).toEqual([layer.id]);
    engine.undo();
    expect(engine.getSnapshot().project).toEqual(before);
    expect(engine.getSnapshot().canUndo).toBe(false);
  },
);
