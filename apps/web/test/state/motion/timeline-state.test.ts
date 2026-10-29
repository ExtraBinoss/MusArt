import { expect, it } from "vitest";
import { createStore } from "jotai";
import { timelineOpenAtom } from "../../../src/state/motion/timeline-state";

it("starts open and remains scoped to the editor's presentation store", () => {
  const first = createStore(),
    second = createStore();
  expect(first.get(timelineOpenAtom)).toBe(true);
  first.set(timelineOpenAtom, false);
  expect(first.get(timelineOpenAtom)).toBe(false);
  expect(second.get(timelineOpenAtom)).toBe(true);
});
