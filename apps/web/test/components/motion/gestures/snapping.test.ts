import { expect, it } from "vitest";
import {
  nearestTimelineSnap,
  timelineSnapReferences,
} from "../../../../src/components/motion/gestures/snapping";
import { createLayer, createPage } from "@musart/core";

it("keeps the exact reference time and chooses the nearest candidate around a binary-search boundary", () => {
  const third = { value: 1, rate: 3 };
  const references = [
    { seconds: 0, time: { value: 0, rate: 1 } },
    { seconds: 1 / 3, time: third },
    { seconds: 2, time: { value: 2, rate: 1 } },
  ];
  expect(nearestTimelineSnap(references, 0.34, { value: 1, rate: 1 }, 100)).toBe(third);
  expect(nearestTimelineSnap(references, 1.01, { value: 1, rate: 1 }, 100)).toEqual({
    value: 1,
    rate: 1,
  });
  expect(nearestTimelineSnap(references, 3, { value: 1, rate: 1 }, 100)).toBeNull();
});

it("preserves preceding-key, following-key, then playhead tie order", () => {
  const previous = { value: 0, rate: 1 },
    next = { value: 2, rate: 1 },
    playhead = { value: 1, rate: 1 };
  expect(
    nearestTimelineSnap(
      [
        { seconds: 0, time: previous },
        { seconds: 2, time: next },
      ],
      1,
      { value: 2, rate: 1 },
      5,
    ),
  ).toBe(previous);
  expect(nearestTimelineSnap([{ seconds: 2, time: next }], 1, previous, 5)).toBe(next);
  expect(nearestTimelineSnap([], 1.01, playhead, 100)).toBe(playhead);
});

it("enforces the screen-pixel radius and rejects unusable scales", () => {
  const head = { value: 0, rate: 1 };
  expect(nearestTimelineSnap([], 0.06, head, 100)).toBe(head);
  expect(nearestTimelineSnap([], 0.061, head, 100)).toBeNull();
  for (const scale of [0, -1, Number.NaN])
    expect(nearestTimelineSnap([], 0, head, scale)).toBeNull();
});

it("captures sorted exact references once and omits all moving keys", () => {
  const third = { value: 1, rate: 3 };
  const page = createPage({
    layers: [createLayer("rectangle", { id: "hero" })],
    motion: {
      version: 2,
      initialized: true,
      mode: "motion",
      duration: { value: 2, rate: 1 },
      frameRate: { numerator: 30, denominator: 1 },
      tracks: [
        {
          id: "clip",
          layerId: "hero",
          start: { value: 0, rate: 1 },
          end: null,
          properties: [
            {
              id: "x",
              target: { kind: "layer", layerId: "hero", property: "x" },
              keyframes: [
                { id: "moving", time: { value: 0, rate: 1 }, value: 0 },
                { id: "fixed", time: third, value: 2 },
              ],
            },
          ],
        },
      ],
    },
  });
  const references = timelineSnapReferences(page, new Set(["moving"]));
  expect(references.map((item) => item.seconds)).toEqual([0, 1 / 3, 2]);
  expect(references[1]!.time).toBe(third);
});
