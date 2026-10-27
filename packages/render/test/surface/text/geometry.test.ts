import { expect, it } from "vitest";
import { createLayer } from "@musart/core";
import { buildCurveAtlas } from "../../../src/surface/text/atlas";
import { glyphGeometry } from "../../../src/surface/text/geometry";
import { layoutText } from "../../../src/surface/text/layout";
import { outlineFont } from "../../text-fixture";
it("instances glyph quads with analytic edge padding and skips empty space geometry", () => {
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
    -4, 6, 58, 78,
  ]);
  expect(geometry.getAttribute("glyphBands").itemSize).toBe(2);
  expect(geometry.getAttribute("glyphRange").count).toBe(2);
  geometry.dispose();
  atlas.texture.dispose();
});
