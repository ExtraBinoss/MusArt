import { expect, it } from "vitest";
import { nearestTimelineSnap } from "../../../../src/components/motion/gestures/snapping";

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
