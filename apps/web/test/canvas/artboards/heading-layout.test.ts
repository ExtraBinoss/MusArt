import { expect, it } from "vitest";
import { arrangeArtboards } from "../../../src/canvas/artboards/layout";
import {
  layoutArtboardHeadings,
  HEADING_HEIGHT,
} from "../../../src/canvas/artboards/heading-layout";
it("keeps mixed-size artboard headings disjoint and screen-sized through extreme zoom and pan", () => {
  const workspace = arrangeArtboards(
    [160, 280, 90, 400, 120, 200].map((width, index) => ({
      id: String(index),
      name: `Long heading ${index}`,
      width,
      height: [220, 100, 300, 140, 160, 320][index]!,
    })),
  );
  for (const zoom of [0.05, 0.1, 0.5, 1, 4]) {
    const headings = layoutArtboardHeadings(workspace, { x: 37, y: -20, zoom });
    for (const [index, heading] of headings.entries()) {
      expect(heading.width).toBeGreaterThanOrEqual(96);
      expect(heading.stem).toBeGreaterThanOrEqual(6);
      for (const other of headings.slice(0, index))
        expect(
          heading.x < other.x + other.width &&
            heading.x + heading.width > other.x &&
            heading.y < other.y + HEADING_HEIGHT &&
            heading.y + HEADING_HEIGHT > other.y,
        ).toBe(false);
    }
    if (zoom === 0.05) {
      expect(headings.every((heading) => heading.compact)).toBe(true);
      expect(headings.some((heading) => heading.stem > 6)).toBe(true);
    }
    if (zoom === 4) expect(headings.every((heading) => !heading.compact)).toBe(true);
  }
  expect(layoutArtboardHeadings(arrangeArtboards([]), { x: 0, y: 0, zoom: 1 })).toEqual([]);
});
