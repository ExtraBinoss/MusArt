import { expect, test } from "vitest";
import { validateProject } from "@musart/core";
import {
  createBrandComposition,
  BRAND_ART_SOURCES,
  type BrandArtSources,
} from "../../../../src/ui/brand/ssr/composition";
test("the portable artist collage uses separate native ASCII/Bayer effects and real image sources", () => {
  const sources = Object.fromEntries(
    BRAND_ART_SOURCES.map((source) => [source.id, `data:${source.mime};base64,AAAA`]),
  ) as BrandArtSources;
  const project = createBrandComposition(sources);
  expect(() => validateProject(project)).not.toThrow();
  const page = project.pages[0]!;
  expect([page.width, page.height]).toEqual([640, 600]);
  expect(page.background).toBe("#F1F0EC");
  expect(page.layers.flatMap((layer) => layer.effects.map((effect) => effect.type))).toEqual(
    expect.arrayContaining(["bit-dither", "ascii"]),
  );
  expect(Object.keys(project.assets)).toHaveLength(4);
  expect(page.layers.some((layer) => layer.kind === "ellipse" || layer.kind === "text")).toBe(
    false,
  );
});
