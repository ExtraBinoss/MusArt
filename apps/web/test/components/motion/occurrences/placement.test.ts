import { expect, test } from "vitest";
import { createLayer, createPage } from "@musart/core";
import { planOccurrencePlacement } from "../../../../src/components/motion/occurrences/placement";
const t = (value: number, rate = 1) => ({ value, rate });
test("copies the chosen or nearest occurrence into a finite exact gap without changing source offsets", () => {
  const page = createPage({
    layers: [createLayer("rectangle", { id: "hero" })],
    motion: {
      version: 2,
      initialized: true,
      mode: "motion",
      duration: t(8),
      frameRate: { numerator: 30, denominator: 1 },
      tracks: [
        { id: "a", layerId: "hero", start: t(0), end: t(2), properties: [] },
        { id: "b", layerId: "hero", start: t(3), end: t(4), properties: [] },
      ],
    },
  });
  const plan = planOccurrencePlacement(page, "hero", t(5, 2), "a")!;
  expect(plan).toMatchObject({ start: t(5, 2), end: t(3), source: { id: "a" } });
  expect(planOccurrencePlacement(page, "hero", t(4))!.source!.id).toBe("b");
  expect(planOccurrencePlacement(page, "hero", t(1))).toBeUndefined();
  expect(planOccurrencePlacement(page, "hero", t(8))).toBeUndefined();
  expect(planOccurrencePlacement(page, "hero", t(-1))).toBeUndefined();
  page.motion!.tracks = [];
  expect(planOccurrencePlacement(page, "hero", t(7))).toEqual({ start: t(7), end: t(8) });
});
