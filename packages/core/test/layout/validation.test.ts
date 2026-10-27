import { it, expect } from "vitest";
import {
  validateInsets,
  validateLayerLayout,
  validatePageLayout,
} from "../../src/layout/validation";
it("validates optional layer guides, dimensions and working spaces", () => {
  validateInsets({ top: 1, right: 2, bottom: 3, left: 4 }, 10, 10);
  validateLayerLayout(
    {
      width: 100,
      height: 80,
      margin: { top: 1, right: 2, bottom: 3, left: 4 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      guides: [
        { id: "x", axis: "x", position: 100 },
        { id: "y", axis: "y", position: 80 },
      ],
    },
    new Set(),
  );
  for (const colorSpace of ["srgb", "display-p3", "cmyk-proof"])
    validatePageLayout({
      colorSpace,
      rulers: false,
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      width: 1,
      height: 1,
    });
  validatePageLayout({});
  for (const run of [
    () => validateInsets({ top: 1, right: 9, bottom: 1, left: 9 }, 10, 10),
    () => validateInsets({ top: -1, right: 0, bottom: 0, left: 0 }, 10, 10),
    () => validatePageLayout({ colorSpace: "cmyk" }),
    () => validatePageLayout({ rulers: 1 }),
    () =>
      validateLayerLayout(
        { width: 10, height: 10, guides: [{ id: "g", axis: "z", position: 0 }] },
        new Set(),
      ),
    () =>
      validateLayerLayout(
        { width: 10, height: 10, guides: [{ id: "g", axis: "x", position: 11 }] },
        new Set(),
      ),
  ])
    expect(run).toThrow();
});
