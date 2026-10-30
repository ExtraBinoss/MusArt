import { expect, it } from "vitest";
import { createLayer, createPage, type MotionKeyframe } from "@musart/core";
import {
  projectEasingSegments,
  projectKeyMarkers,
  projectTimelineRows,
} from "../../../src/components/motion/tree";

it("projects canonical groups, property tracks and foreground ordering without copying artwork", () => {
  const group = createLayer("group", { id: "group" }),
    child = createLayer("rectangle", { id: "child", parentId: "group" }),
    front = createLayer("text", { id: "front" });
  const page = createPage({
    layers: [group, child, front],
    motion: {
      version: 1,
      initialized: true,
      mode: "motion",
      duration: { value: 2, rate: 1 },
      frameRate: { numerator: 30, denominator: 1 },
      tracks: [
        {
          id: "track",
          layerId: "group",
          start: { value: 0, rate: 1 },
          end: null,
          properties: [
            {
              id: "property",
              target: { kind: "layer", layerId: "group", property: "x" },
              keyframes: [],
            },
          ],
        },
      ],
    },
  });
  const rows = projectTimelineRows(page, new Set());
  expect(rows.map((row) => row.key)).toEqual(["front", "group", "property", "child"]);
  expect(rows[1]?.layer).toBe(group);
  expect(rows[2]?.depth).toBe(1);
  expect(rows[3]?.depth).toBe(1);
  expect(projectTimelineRows(page, new Set(["group"])).map((row) => row.key)).toEqual([
    "front",
    "group",
  ]);
  expect(projectTimelineRows(createPage(), new Set())).toEqual([]);
});

it("keeps easing connectors bounded, including a long segment across an offscreen pair", () => {
  const keys = [
    { id: "first", time: { value: 0, rate: 1 }, value: 0 },
    { id: "last", time: { value: 100, rate: 1 }, value: 1 },
  ];
  const visible = projectEasingSegments(keys, 400, 200, 100);
  expect(visible).toHaveLength(1);
  expect(visible[0]).toMatchObject({ left: 400, width: 200, destination: keys[1] });
  const dense = Array.from({ length: 20000 }, (_, index) => ({
    id: String(index),
    time: { value: index, rate: 1000 },
    value: index,
  }));
  expect(projectEasingSegments(dense, 400, 200, 100)).toEqual([]);
  expect(projectEasingSegments([], 0, 100, 100)).toEqual([]);
});

it("bounds dense keyframe DOM markers while retaining exact times and cluster counts", () => {
  const keys: MotionKeyframe[] = Array.from({ length: 20_000 }, (_, index) => ({
    id: `key-${index}`,
    time: { value: index, rate: 1000 },
    value: index,
  }));
  const markers = projectKeyMarkers(keys, 400, 200, 100);
  expect(markers.length).toBeLessThanOrEqual(29);
  expect(markers.length).toBeGreaterThan(20);
  expect(markers.every((marker) => marker.count > 1 && keys.includes(marker.key))).toBe(true);
  expect(markers[0]?.key.time).toEqual({ value: 4000, rate: 1000 });
  expect(projectKeyMarkers([], 0, 100, 100)).toEqual([]);
  expect(projectKeyMarkers(keys, 0, 0, 100)).toEqual([]);
  expect(projectKeyMarkers(keys, 0, 100, 0)).toEqual([]);
});

it("keeps one canonical layer row and shows only the chosen occurrence's properties", () => {
  const layer = createLayer("rectangle", { id: "hero" });
  const page = createPage({
    layers: [layer],
    motion: {
      version: 2,
      initialized: true,
      mode: "motion",
      duration: { value: 4, rate: 1 },
      frameRate: { numerator: 30, denominator: 1 },
      tracks: [
        {
          id: "first",
          layerId: "hero",
          start: { value: 0, rate: 1 },
          end: { value: 1, rate: 1 },
          properties: [
            {
              id: "x-first",
              target: { kind: "layer", layerId: "hero", property: "x" },
              keyframes: [],
            },
          ],
        },
        {
          id: "second",
          layerId: "hero",
          start: { value: 2, rate: 1 },
          end: null,
          properties: [
            {
              id: "x-second",
              target: { kind: "layer", layerId: "hero", property: "x" },
              keyframes: [],
            },
          ],
        },
      ],
    },
  });
  const rows = projectTimelineRows(page, new Set(), new Map([["hero", "second"]]));
  expect(rows.map((row) => row.key)).toEqual(["hero", "x-second"]);
  expect(rows[0]!.occurrences).toHaveLength(2);
  expect(rows[0]!.track!.id).toBe("second");
  expect(rows[0]!.layer).toBe(layer);
});
