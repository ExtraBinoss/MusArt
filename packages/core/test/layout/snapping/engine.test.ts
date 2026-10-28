import { expect, it } from "vitest";
import { createLayer, createPage } from "../../../src/document/factories";
import { SnapIndex } from "../../../src/layout/snapping/engine";
it("snaps collective edges/centers with truthful colored cues and gap measurements", () => {
  const moving = createLayer("rectangle", { id: "moving", x: 20, y: 20, width: 40, height: 40 });
  const target = createLayer("rectangle", { id: "target", x: 200, y: 100, width: 80, height: 60 });
  const page = createPage({
    width: 1000,
    height: 800,
    layers: [moving, target],
    guides: [{ id: "guide", axis: "y", position: 53, color: "#ff00aa" }],
  });
  const index = new SnapIndex(page, [moving.id]);
  expect(index.movingBounds).toEqual({ x: 20, y: 20, width: 40, height: 40 });
  const result = index.snap({ x: 157, y: 12, width: 40, height: 40 }, 4);
  expect(result.delta).toEqual({ x: 3, y: 1 });
  expect(result.bounds).toEqual({ x: 160, y: 13, width: 40, height: 40 });
  expect(result.cues.find((c) => c.axis === "x")).toEqual(
    expect.objectContaining({
      targetId: "target",
      position: 200,
      gap: expect.objectContaining({ value: 47 }),
    }),
  );
  expect(result.cues.find((c) => c.axis === "y")).toEqual(
    expect.objectContaining({ targetId: "guide", color: "#ff00aa" }),
  );
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.cues[0]!.from)).toBe(true);
  expect(page.layers[0]!.x).toBe(20);
  expect(index.snap({ x: 157, y: 12, width: 40, height: 40 }, 0).cues).toEqual([]);
});
it("treats tolerance in document units so callers can preserve a constant screen tolerance", () => {
  const page = createPage({
    width: 1000,
    height: 800,
    guides: [{ id: "g", axis: "x", position: 100 }],
  });
  const index = new SnapIndex(page);
  expect(index.movingBounds).toBeNull();
  expect(index.snap({ x: 104, y: 63, width: 0, height: 0 }, 6).delta.x).toBe(-4);
  expect(index.snap({ x: 104, y: 63, width: 0, height: 0 }, 6 / 2).delta.x).toBe(0);
  expect(index.snap({ x: 102, y: 63, width: 0, height: 0 }, 6 / 2).delta.x).toBe(-2);
});
it("bounds candidate comparisons for ten thousand aligned targets and excludes moving descendants", () => {
  const group = createLayer("group", { id: "moving-group", width: 10, height: 10 });
  const child = createLayer("rectangle", { id: "moving-child", parentId: group.id, x: 37, y: 53 });
  const layers = Array.from({ length: 10000 }, (_, i) =>
    createLayer("rectangle", { id: `target-${i}`, x: 100, y: i * 2, width: 20, height: 1 }),
  );
  const index = new SnapIndex(
    createPage({ width: 1000, height: 30000, layers: [group, child, ...layers] }),
    [group.id],
  );
  const result = index.snap({ x: 98, y: 2223, width: 0, height: 0 }, 6);
  expect(result.delta.x).toBe(2);
  expect(result.checks).toBeLessThanOrEqual(24);
  expect(index.targetCount).toBe(60006);
  expect(result.cues.every((c) => c.targetId !== child.id && c.targetId !== group.id)).toBe(true);
});
it.each([NaN, Infinity, -1])("rejects invalid geometry/tolerance %s", (value) => {
  const index = new SnapIndex(createPage());
  expect(() => index.snap({ x: 0, y: 0, width: 10, height: 10 }, value)).toThrow(RangeError);
  expect(() => index.snap({ x: 0, y: 0, width: value, height: 10 }, 6)).toThrow(RangeError);
});

it("applies the same guide priority across different moving edges at equal distance", () => {
  const layer = createLayer("rectangle", { id: "target", x: 95, y: 80, width: 1, height: 1 });
  const page = createPage({
    width: 1000,
    height: 800,
    layers: [layer],
    guides: [{ id: "manual", axis: "x", position: 204 }],
  });
  const result = new SnapIndex(page).snap({ x: 100, y: 20, width: 100, height: 20 }, 4);
  expect(result.delta.x).toBe(4);
  expect(result.cues.find((c) => c.axis === "x")?.targetId).toBe("manual");
});

it("preserves the inclusive six-screen-pixel boundary after a float32 CSS zoom round trip", () => {
  const moving = createLayer("rectangle", { id: "moving", x: 10, y: 10, width: 20, height: 20 });
  const target = createLayer("rectangle", { id: "target", x: 100, y: 80, width: 20, height: 20 });
  const index = new SnapIndex(createPage({ width: 200, height: 160, layers: [moving, target] }), [
    moving.id,
  ]);
  // Native evidence: 2.0000000038093093 view zoom renders at a 2.0 CSS scale.
  const zoom = 2.0000000038093093,
    x = moving.x + 134 / zoom;
  const result = index.snap({ x, y: 10, width: 20, height: 20 }, 6 / zoom);
  expect(result.bounds.x).toBe(80);
  expect(result.cues.find((c) => c.axis === "x")?.targetId).toBe("target");
  expect(
    index
      .snap({ x: x - 0.0001, y: 10, width: 20, height: 20 }, 6 / zoom)
      .cues.some((c) => c.axis === "x"),
  ).toBe(false);
  expect(index.snap({ x, y: 10, width: 20, height: 20 }, 0).cues.some((c) => c.axis === "x")).toBe(
    false,
  );
});
