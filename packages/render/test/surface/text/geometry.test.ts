import { expect, it } from "vitest";
import { createLayer } from "@musart/core";
import { buildCurveAtlas } from "../../../src/surface/text/atlas";
import { glyphGeometry, updateGlyphGeometry } from "../../../src/surface/text/geometry";
import { layoutText } from "../../../src/surface/text/layout";
import { outlineFont } from "../../text-fixture";
it("instances exact glyph bounds for projection-aware GPU dilation and skips empty space geometry", () => {
  const font = outlineFont(),
    layer = createLayer("text", { text: "A A", fontSize: 100, width: 400, height: 200 });
  const layout = layoutText(layer, font),
    atlas = buildCurveAtlas(
      layout.map(({ glyph }) => glyph),
      1000,
    ),
    geometry = glyphGeometry(layer, layout, atlas, 1000);
  expect(geometry.instanceCount).toBe(2);
  expect(Array.from(geometry.getAttribute("glyphPosition").array).slice(0, 4)).toEqual([
    0, 10, 50, 70,
  ]);
  expect(Array.from(geometry.getAttribute("glyphBounds").array).slice(0, 4)).toEqual([
    0, -700, 500, 700,
  ]);
  expect(geometry.getAttribute("glyphBands").itemSize).toBe(2);
  expect(geometry.getAttribute("glyphRange").count).toBe(2);
  geometry.dispose();
  atlas.texture.dispose();
});

it("updates placement to match fresh geometry without changing buffer identities", () => {
  const font = outlineFont(),
    base = createLayer("text", { text: "A A", fontSize: 30, width: 400, height: 150 });
  const layout = layoutText(base, font),
    atlas = buildCurveAtlas(
      layout.map((x) => x.glyph),
      font.unitsPerEm,
    ),
    geometry = glyphGeometry(base, layout, atlas, font.unitsPerEm);
  const original = geometry.getAttribute("glyphPosition");
  const layer = { ...base, fontSize: 36, letterSpacing: 8, textAlign: "right" as const };
  const next = layoutText(layer, font),
    reference = glyphGeometry(layer, next, atlas, font.unitsPerEm);
  updateGlyphGeometry(geometry, layer, next, atlas, font.unitsPerEm);
  expect(geometry.getAttribute("glyphPosition")).toBe(original);
  for (const name of ["glyphPosition", "glyphBounds", "glyphBands", "glyphRange"])
    expect(geometry.getAttribute(name).array).toEqual(reference.getAttribute(name).array);
  const before = original.array.slice();
  expect(() =>
    updateGlyphGeometry(geometry, layer, next.slice(0, 1), atlas, font.unitsPerEm),
  ).toThrow("topology");
  expect(original.array).toEqual(before);
  geometry.dispose();
  reference.dispose();
  atlas.texture.dispose();
});
