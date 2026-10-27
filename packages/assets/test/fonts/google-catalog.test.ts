import { expect, it } from "vitest";
import { loadFontCatalog } from "../../src/fonts/google-catalog";
it("lazily loads the complete1950-family snapshot once with public outline variants and license links", async () => {
  const first = loadFontCatalog();
  expect(loadFontCatalog()).toBe(first);
  const catalog = await first;
  expect(catalog).toHaveLength(1950);
  expect(new Set(catalog.map((font) => font.family)).size).toBe(1950);
  expect(catalog.find((font) => font.family === "Inter")?.category).toBe("sans");
  expect(catalog.find((font) => font.family === "Roboto Slab")?.category).toBe("serif");
  expect(catalog.find((font) => font.family === "Roboto Mono")?.category).toBe("mono");
  expect(catalog.find((font) => font.family === "Pacifico")?.category).toBe("handwriting");
  expect(
    catalog.find((font) => font.family === "Edu NSW ACT Cursive")?.variants?.[0]?.url,
  ).toContain("fonts.gstatic.com");
  for (const font of catalog) {
    expect(font.source).toBe("google");
    expect(font.licenseURL).toMatch(/^https:\/\//);
    expect(font.variants!.length).toBeGreaterThan(0);
    for (const variant of font.variants!) {
      expect(variant.url).toMatch(
        /^https:\/\/(raw\.githubusercontent\.com\/google\/fonts\/ddf386ba1b9fbc6b2c818f1ddcd9148f54ced94b\/|fonts\.gstatic\.com\/)/,
      );
      expect(variant.weight).toBeGreaterThanOrEqual(100);
      expect(variant.weight).toBeLessThanOrEqual(900);
    }
  }
});
