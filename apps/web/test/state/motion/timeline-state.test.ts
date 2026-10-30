import { expect, it } from "vitest";
import { createStore } from "jotai";
import { timelineOpenAtom } from "../../../src/state/motion/timeline-state";

it("starts in peek and remains scoped to the editor's presentation store", () => {
  const first = createStore(),
    second = createStore();
  expect(first.get(timelineOpenAtom)).toBe(false);
  first.set(timelineOpenAtom, true);
  expect(first.get(timelineOpenAtom)).toBe(true);
  expect(second.get(timelineOpenAtom)).toBe(false);
});
