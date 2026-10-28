import { expect, test } from "vitest";
import { createEffect, createLayer, createPage } from "@musart/core";
import { previewComposition } from "../../../src/services/session/preview-composition";
function fixture() {
  const dither = createEffect("dither", { id: "dither" }),
    later = createEffect("brightness", { id: "later" });
  const maskGroup = createLayer("group", {
    id: "mask-source",
    x: 30,
    y: 40,
    width: 80,
    height: 50,
    maskSource: true,
    opacity: 0.7,
    effects: [createEffect("blur", { id: "mask-blur" })],
  });
  const maskChild = createLayer("ellipse", {
    id: "mask-child",
    parentId: maskGroup.id,
    x: 0,
    y: 0,
    width: 40,
    height: 50,
  });
  const parent = createLayer("group", {
    id: "parent",
    x: 10,
    y: 20,
    width: 180,
    height: 140,
    opacity: 0.4,
    effects: [createEffect("contrast", { id: "ancestor-fx" })],
  });
  const owner = createLayer("image", {
    id: "owner",
    parentId: parent.id,
    x: 20,
    y: 20,
    width: 80,
    height: 50,
    assetId: "image",
    effects: [dither, later],
    mask: { layerId: maskGroup.id, mode: "alpha", enabled: true, inverted: true },
  });
  return {
    dither,
    later,
    maskGroup,
    maskChild,
    parent,
    owner,
    page: createPage({ layers: [maskGroup, maskChild, parent, owner] }),
  };
}
test("renders the requested effect stage with complete mask dependencies, leaving the canonical stack unchanged", () => {
  const d = fixture(),
    before = structuredClone(d.page),
    result = previewComposition(d.page, [d.owner.id], [], {
      kind: "effect",
      effectId: d.dither.id,
    });
  expect(result.layers.find((l) => l.id === d.owner.id)!.effects.map((e) => e.id)).toEqual([
    d.dither.id,
  ]);
  const source = result.layers.find(
    (l) => l.id === result.layers.find((l) => l.id === d.owner.id)!.mask!.layerId,
  )!;
  expect(source.id).not.toBe(d.maskGroup.id);
  expect(source.effects[0]!.type).toBe("blur");
  expect(result.layers.some((l) => l.parentId === source.id && l.kind === "ellipse")).toBe(true);
  expect(result.background).toBe("transparent");
  expect(d.page).toEqual(before);
});
test("mask coverage uses the existing GPU mask on white over black, retaining source effects/opacity and neutralizing only painted ancestors", () => {
  const d = fixture(),
    before = structuredClone(d.page),
    result = previewComposition(d.page, [d.owner.id], [], { kind: "mask" });
  expect(result.background).toBe("#000000");
  const owner = result.layers.find((l) => l.id === d.owner.id)!;
  expect(owner).toMatchObject({
    kind: "rectangle",
    fill: "#ffffff",
    assetId: null,
    opacity: 1,
    effects: [],
    mask: { mode: "alpha", enabled: true, inverted: true },
  });
  expect(result.layers.find((l) => l.id === d.parent.id)).toMatchObject({
    opacity: 1,
    visible: true,
    effects: [],
    mask: null,
  });
  const source = result.layers.find((l) => l.id === owner.mask!.layerId)!;
  expect(source).toMatchObject({ opacity: 0.7, maskSource: true });
  expect(source.effects[0]!.type).toBe("blur");
  expect(result.layers.some((l) => l.parentId === source.id)).toBe(true);
  expect(d.page).toEqual(before);
});
test("asset masks inspect disabled/inverted luminance definitions without editing them, including group owners", () => {
  const owner = createLayer("group", {
    id: "group",
    x: 20,
    y: 30,
    width: 80,
    height: 60,
    mask: { assetId: "matte", mode: "luminance", enabled: false, inverted: true },
  });
  const child = createLayer("image", { id: "child", parentId: owner.id, assetId: "original" }),
    page = createPage({ layers: [owner, child] });
  const result = previewComposition(page, [owner.id], [], { kind: "mask" });
  expect(result.layers).toHaveLength(1);
  expect(result.layers[0]).toMatchObject({
    kind: "rectangle",
    x: 0,
    y: 0,
    mask: { assetId: "matte", mode: "luminance", enabled: true, inverted: true },
  });
  expect(owner.mask!.enabled).toBe(false);
  expect(page.layers).toHaveLength(2);
  expect(previewComposition(page, [owner.id], []).layers).toHaveLength(2);
});
test("rejects absent attachment owners/definitions and invalid variant scopes explicitly", () => {
  const d = fixture();
  expect(() => previewComposition(d.page, [], [], { kind: "mask" })).toThrow("one");
  expect(() =>
    previewComposition(d.page, [d.owner.id, d.maskGroup.id], [], { kind: "mask" }),
  ).toThrow("one");
  expect(() =>
    previewComposition(d.page, [d.owner.id], [], { kind: "effect", effectId: "missing" }),
  ).toThrow("missing");
  expect(() => previewComposition(d.page, [d.maskChild.id], [], { kind: "mask" })).toThrow(
    "missing",
  );
  expect(() => previewComposition(d.page, [d.owner.id], [], { kind: "invalid" } as never)).toThrow(
    "Invalid",
  );
  expect(() => previewComposition(d.page, ["missing"], [], { kind: "mask" })).toThrow();
});
