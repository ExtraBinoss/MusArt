import { expect, it } from "vitest";
import { createLayer, createPage } from "../../src/document/factories";
import {
  clampMotionTrackMove,
  planMotionTrackMove,
  acceptsMotionTrackMove,
} from "../../src/motion/track-move";

it("uses common descendant bounds while keeping the other parent occurrence independent", () => {
  const page = createPage({
    layers: [
      createLayer("group", { id: "group" }),
      createLayer("rectangle", { id: "child", parentId: "group" }),
    ],
    motion: {
      version: 2,
      mode: "motion",
      initialized: true,
      duration: { value: 8, rate: 1 },
      frameRate: { numerator: 30, denominator: 1 },
      tracks: [
        {
          id: "parent",
          layerId: "group",
          start: { value: 1, rate: 1 },
          end: { value: 2, rate: 1 },
          properties: [],
        },
        {
          id: "other-parent",
          layerId: "group",
          start: { value: 5, rate: 1 },
          end: { value: 6, rate: 1 },
          properties: [],
        },
        {
          id: "child-first",
          layerId: "child",
          start: { value: 1, rate: 2 },
          end: { value: 3, rate: 2 },
          properties: [
            {
              id: "x",
              target: { kind: "layer", layerId: "child", property: "x" },
              keyframes: [{ id: "preroll", time: { value: -2, rate: 1 }, value: 10 }],
            },
          ],
        },
        {
          id: "child-later",
          layerId: "child",
          start: { value: 6, rate: 1 },
          end: { value: 7, rate: 1 },
          properties: [],
        },
      ],
    },
  });
  const before = structuredClone(page),
    plan = planMotionTrackMove(page, "parent");
  expect(plan.trackIds).toEqual(["parent", "child-first", "child-later"]);
  expect(plan.layerIds).toEqual(["group", "child"]);
  expect(plan.keyframeIds).toEqual(["preroll"]);
  expect(plan.minimum).toEqual({ value: -1, rate: 2 });
  expect(plan.maximum).toEqual({ value: 1, rate: 1 });
  expect(clampMotionTrackMove(plan, { value: -9999, rate: 1 })).toEqual({
    delta: plan.minimum,
    boundary: "start",
  });
  expect(clampMotionTrackMove(plan, { value: 9999, rate: 1 })).toEqual({
    delta: plan.maximum,
    boundary: "end",
  });
  expect(clampMotionTrackMove(plan, plan.minimum).boundary).toBe("start");
  expect(clampMotionTrackMove(plan, plan.maximum).boundary).toBe("end");
  expect(clampMotionTrackMove(plan, { value: 1, rate: 4 })).toEqual({
    delta: { value: 1, rate: 4 },
    boundary: null,
  });
  expect(page).toEqual(before);
});
it("protects legacy keys before a trimmed clip while preserving v2 signed pre-roll", () => {
  const page = createPage({
    layers: [
      createLayer("group", { id: "g" }),
      createLayer("rectangle", { id: "c", parentId: "g" }),
    ],
    motion: {
      version: 1,
      mode: "motion",
      initialized: true,
      duration: { value: 6, rate: 1 },
      frameRate: { numerator: 30, denominator: 1 },
      tracks: [
        {
          id: "g-track",
          layerId: "g",
          start: { value: 2, rate: 1 },
          end: { value: 4, rate: 1 },
          properties: [],
        },
        {
          id: "c-track",
          layerId: "c",
          start: { value: 1, rate: 1 },
          end: { value: 3, rate: 1 },
          properties: [
            {
              id: "x",
              target: { kind: "layer", layerId: "c", property: "x" },
              keyframes: [{ id: "earlier", time: { value: 1, rate: 4 }, value: 0 }],
            },
          ],
        },
      ],
    },
  });
  const legacy = planMotionTrackMove(page, "g-track");
  expect(legacy.minimum).toEqual({ value: -1, rate: 4 });
  expect(clampMotionTrackMove(legacy, { value: -99, rate: 1 }).delta).toEqual(legacy.minimum);
  page.motion!.version = 2;
  expect(planMotionTrackMove(page, "g-track").minimum).toEqual({ value: -1, rate: 1 });
  expect(planMotionTrackMove(page, "c-track").trackIds).toEqual(["c-track"]);
});
it("tests parent occurrence collisions independently of internal descendant timing", () => {
  const page = createPage({
    layers: [createLayer("rectangle", { id: "hero" })],
    motion: {
      version: 2,
      mode: "motion",
      initialized: true,
      duration: { value: 4, rate: 1 },
      frameRate: { numerator: 30, denominator: 1 },
      tracks: [
        {
          id: "a",
          layerId: "hero",
          start: { value: 1, rate: 3 },
          end: { value: 1, rate: 1 },
          properties: [],
        },
        {
          id: "b",
          layerId: "hero",
          start: { value: 2, rate: 1 },
          end: { value: 3, rate: 1 },
          properties: [],
        },
      ],
    },
  });
  const plan = planMotionTrackMove(page, "a");
  expect(clampMotionTrackMove(plan, { value: -100, rate: 1 }).delta).toEqual({
    value: -1,
    rate: 3,
  });
  expect(acceptsMotionTrackMove(page, plan, { value: -1, rate: 3 })).toBe(true);
  expect(acceptsMotionTrackMove(page, plan, { value: 1, rate: 1 })).toBe(true);
  expect(acceptsMotionTrackMove(page, plan, { value: 2, rate: 1 })).toBe(false);
  expect(acceptsMotionTrackMove(page, plan, { value: -1, rate: 1 })).toBe(false);
  expect(() => planMotionTrackMove(page, "missing")).toThrow("Track not found");
  expect(() => clampMotionTrackMove(plan, { value: NaN, rate: 1 })).toThrow();
  expect(
    clampMotionTrackMove(
      { minimum: { value: 0, rate: 1 }, maximum: { value: -1, rate: 1 } },
      { value: -1, rate: 1 },
    ),
  ).toEqual({ delta: { value: 0, rate: 1 }, boundary: "start" });
});
