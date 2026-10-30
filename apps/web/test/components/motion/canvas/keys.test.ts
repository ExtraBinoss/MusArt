import { expect, it } from "vitest";
import { indexTimelineCanvas } from "../../../../src/components/motion/canvas/index";
import { projectCanvasKeys } from "../../../../src/components/motion/canvas/keys";
import type { TimelineRow } from "../../../../src/components/motion/tree";
import { canvasFixture } from "./support";

it("bounds dense keys by visible buckets and keeps cluster counts and authored identities", () => {
  const d = canvasFixture();
  const row = d.rows[1]!;
  if (row.kind !== "property") throw new Error("Missing fixture property");
  const keyframes = Array.from({ length: 20000 }, (_, index) => ({
    id: `key-${index}`,
    time: { value: index, rate: 1000 },
    value: index,
  }));
  const rows: TimelineRow[] = [{ ...row, property: { ...row.property, keyframes } }];
  const indexed = indexTimelineCanvas(rows)[0]!;
  const result = projectCanvasKeys(
    indexed,
    0,
    { ...d.model, rows },
    { left: 400, top: 0, width: 200, height: 24 },
  );
  const keys = result.filter((item) => item.kind === "key");
  expect(keys.length).toBeLessThanOrEqual(30);
  expect(keys.every((key) => key.count > 1)).toBe(true);
  expect(keys.reduce((count, key) => count + key.count, 0)).toBeGreaterThan(2000);
  expect(keys.every((key) => keyframes[key.hit.firstKeyIndex]?.id === key.hit.keyId)).toBe(true);
  expect(result.filter((item) => item.kind === "easing")).toHaveLength(0);
});
it("previews signed key movement without mutating keys and exposes only a small easing hit target", () => {
  const d = canvasFixture();
  const indexed = indexTimelineCanvas(d.rows)[1]!;
  const model = {
    ...d.model,
    selectedKeyIds: new Set(["b"]),
    draft: {
      action: "keys" as const,
      delta: { value: 1, rate: 2 },
      keyIds: new Set(["b"]),
      layerIds: new Set<string>(),
    },
  };
  const result = projectCanvasKeys(indexed, 1, model, { left: 0, top: 0, width: 200, height: 48 });
  const moved = result.find((item) => item.kind === "key" && item.hit.keyId === "b");
  expect(moved).toMatchObject({ selected: true, bounds: { x: 141, y: 24 } });
  const easing = result.find((item) => item.kind === "easing");
  expect(easing?.bounds.width).toBe(150);
  expect(easing?.hit.bounds.width).toBe(14);
  expect(indexed.keys[1]?.key.time).toEqual({ value: 1, rate: 1 });
  expect(
    projectCanvasKeys(indexTimelineCanvas(d.rows)[0]!, 0, d.model, {
      left: 0,
      top: 0,
      width: 100,
      height: 24,
    }),
  ).toEqual([]);
});
it("paints marquee ranges immediately while keeping only the captured additive base outside the rectangle", () => {
  const d = canvasFixture(),
    indexed = indexTimelineCanvas(d.rows)[1]!;
  const viewport = { left: 0, top: 0, width: 200, height: 48 };
  const initial = projectCanvasKeys(
    indexed,
    1,
    {
      ...d.model,
      selectedKeyIds: new Set(["b"]),
      selectionPreview: { base: new Set(["a"]), ranges: [] },
    },
    viewport,
  );
  expect(
    initial.filter((item) => item.kind === "key").map((item) => [item.hit.keyId, item.selected]),
  ).toEqual([
    ["a", true],
    ["b", false],
  ]);
  const moved = projectCanvasKeys(
    indexed,
    1,
    {
      ...d.model,
      selectedKeyIds: new Set(["b"]),
      selectionPreview: {
        base: new Set(),
        ranges: [{ propertyId: "position", first: 0, after: 1 }],
      },
    },
    viewport,
  );
  expect(
    moved.filter((item) => item.kind === "key").map((item) => [item.hit.keyId, item.selected]),
  ).toEqual([
    ["a", true],
    ["b", false],
  ]);
});
it("relinks crossed keys in current temporal order without sorting the full authored sequence per move", () => {
  const d = canvasFixture(),
    row = d.rows[1]!;
  if (row.kind !== "property") throw new Error("Missing property fixture");
  const rows: TimelineRow[] = [
    {
      ...row,
      property: {
        ...row.property,
        keyframes: [
          ...row.property.keyframes,
          { id: "c", time: { value: 2, rate: 1 }, value: 200 },
        ],
      },
    },
  ];
  const indexed = indexTimelineCanvas(rows)[0]!;
  const moved = projectCanvasKeys(
    indexed,
    0,
    {
      ...d.model,
      rows,
      draft: {
        action: "keys",
        delta: { value: 2, rate: 1 },
        keyIds: new Set(["b"]),
        layerIds: new Set(),
      },
    },
    { left: 0, top: 0, width: 400, height: 24 },
  );
  expect(
    moved
      .filter((item) => item.kind === "easing")
      .map((item) => [item.hit.previousKeyId, item.hit.keyId]),
  ).toEqual([
    ["a", "c"],
    ["c", "b"],
  ]);
  expect(indexed.keys.map((entry) => entry.key.id)).toEqual(["a", "b", "c"]);
});
it("retimes child channels from a group capture even though the primary track ID belongs to its parent", () => {
  const d = canvasFixture(),
    indexed = indexTimelineCanvas(d.rows)[1]!;
  const moved = projectCanvasKeys(
    indexed,
    1,
    {
      ...d.model,
      draft: {
        action: "move",
        delta: { value: 1, rate: 2 },
        trackId: "parent",
        trackIds: new Set(["parent", "first"]),
        layerIds: new Set(["parent", "hero"]),
        keyIds: new Set(["a", "b"]),
      },
    },
    { left: 0, top: 0, width: 200, height: 48 },
  );
  expect(moved.filter((item) => item.kind === "key").map((key) => key.bounds.x)).toEqual([41, 141]);
  expect(indexed.keys.map((key) => key.time)).toEqual([0, 1]);
});
