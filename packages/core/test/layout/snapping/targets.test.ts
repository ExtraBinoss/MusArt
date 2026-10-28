import { expect, it } from "vitest";
import { createLayer, createPage } from "../../../src/document/factories";
import { collectSnapTargets } from "../../../src/layout/snapping/targets";
it("indexes artboard/margin/manual anchors and visible locked layers, excluding moving or hidden subtrees", () => {
  const group = createLayer("group", { id: "moving" }),
    child = createLayer("rectangle", { id: "moving-child", parentId: group.id });
  const hidden = createLayer("group", { id: "hidden", visible: false }),
    hiddenChild = createLayer("rectangle", { id: "hidden-child", parentId: hidden.id });
  const mask = createLayer("group", { id: "mask", maskSource: true }),
    masked = createLayer("rectangle", { id: "mask-child", parentId: mask.id });
  const transparent = createLayer("rectangle", { id: "transparent", opacity: 0 });
  const locked = createLayer("rectangle", {
    id: "locked",
    locked: true,
    x: 100,
    y: 120,
    width: 40,
    height: 20,
  });
  const page = createPage({
    id: "board",
    width: 500,
    height: 400,
    layers: [group, child, hidden, hiddenChild, mask, masked, transparent, locked],
    guides: [{ id: "manual", axis: "x", position: 70, color: "#123456" }],
    margins: { top: 10, right: 20, bottom: 30, left: 40 },
  });
  const targets = collectSnapTargets(page, new Set([group.id]));
  expect(new Set(targets.map((t) => t.id))).toEqual(
    new Set(["board", "board:margins", "manual", "locked"]),
  );
  expect(targets).toContainEqual({
    id: "manual",
    axis: "x",
    value: 70,
    min: 0,
    max: 400,
    kind: "guide",
    color: "#123456",
  });
  expect(
    targets.filter((t) => t.id === "board:margins" && t.axis === "x").map((t) => t.value),
  ).toEqual([40, 260, 480]);
  expect(targets.filter((t) => t.id === "locked" && t.axis === "x").map((t) => t.value)).toEqual([
    100, 120, 140,
  ]);
});
it("uses transformed groups and layer guides in world coordinates without treating slanted guides as axis aligned", () => {
  const group = createLayer("group", {
    id: "group",
    x: 100,
    y: 100,
    width: 100,
    height: 100,
    rotation: 90,
  });
  const child = createLayer("rectangle", {
    id: "child",
    parentId: group.id,
    x: 10,
    y: 20,
    width: 30,
    height: 40,
    guides: [{ id: "child-guide", axis: "x", position: 5, color: "#abcdef" }],
  });
  const tilted = createLayer("rectangle", {
    id: "tilted",
    rotation: 30,
    guides: [{ id: "slanted", axis: "y", position: 3 }],
  });
  const targets = collectSnapTargets(createPage({ layers: [group, child, tilted] }), new Set());
  const guide = targets.find((t) => t.id === "child-guide")!;
  expect(guide.axis).toBe("y");
  expect(guide.value).toBeCloseTo(115);
  expect(guide.color).toBe("#abcdef");
  expect(targets.some((t) => t.id === "slanted")).toBe(false);
  expect(
    targets.filter((t) => t.id === "child" && t.axis === "x").map((t) => Math.round(t.value)),
  ).toEqual([140, 160, 180]);
});
