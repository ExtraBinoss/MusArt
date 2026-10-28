import { expect, test } from "vitest";
import { SOCIAL_PRESETS } from "@musart/core";
import {
  guidePresetFrame,
  guidesFromPreset,
} from "../../../../src/components/properties/guides/presets";
test("fits the genuine format ratio, centers the frame and allocates new appendable IDs", () => {
  const square = SOCIAL_PRESETS[0]!,
    bounds = { width: 1080, height: 1350 };
  expect(guidePresetFrame(bounds, square)).toEqual({ x: 0, y: 135, width: 1080, height: 1080 });
  const guides = guidesFromPreset(bounds, square),
    next = guidesFromPreset(bounds, square);
  expect(guides.map(({ axis, position }) => ({ axis, position }))).toEqual([
    { axis: "x", position: 0 },
    { axis: "x", position: 1080 },
    { axis: "y", position: 135 },
    { axis: "y", position: 1215 },
  ]);
  expect(new Set([...guides, ...next].map((g) => g.id)).size).toBe(8);
  expect(guidePresetFrame({ width: 1920, height: 1080 }, square)).toEqual({
    x: 420,
    y: 0,
    width: 1080,
    height: 1080,
  });
});
test("scales only the catalogue's supplied safe area into the fitted banner and keeps it in target coordinates", () => {
  const preset = SOCIAL_PRESETS.find((p) => p.id === "youtube-banner")!,
    guides = guidesFromPreset({ width: 1280, height: 1000 }, preset);
  expect(guides).toHaveLength(8);
  expect(guides.slice(4).map((g) => g.position)).toEqual([253.5, 1026.5, 394.25, 605.75]);
  expect(guides.every((g) => g.position >= 0 && g.position <= (g.axis === "x" ? 1280 : 1000))).toBe(
    true,
  );
});
