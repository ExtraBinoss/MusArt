import { expect, it, vi } from "vitest";
import { buildCurveAtlas } from "../../../src/surface/text/atlas";
import { outlineFont } from "../../text-fixture";
it("packs exact curves and dual-axis bands, deduplicates glyph indices and tracks allocations", () => {
  const font = outlineFont(),
    glyph = font.charToGlyph("A"),
    atlas = buildCurveAtlas([glyph, glyph, font.charToGlyph(" ")], font.unitsPerEm);
  expect(atlas.glyphs.size).toBe(2);
  const record = atlas.glyphs.get(glyph.index)!;
  expect(record.bounds).toEqual([0, -700, 500, 700]);
  const data = atlas.texture.image.data as Float32Array;
  const header = record.header * 4;
  expect(data[header + 1]).toBe(2);
  expect(data[(record.header + 16) * 4 + 1]).toBe(2);
  expect(atlas.texture.generateMipmaps).toBe(false);
  expect(atlas.bytes).toBe(data.byteLength);
  expect(buildCurveAtlas([], 1000).bytes).toBe(16);
  atlas.texture.dispose();
});
it("rejects unbounded per-band work", () => {
  const font = outlineFont(),
    glyph = font.charToGlyph("A");
  vi.spyOn(glyph, "getPath").mockReturnValue({
    commands: Array.from({ length: 1100 }, () => [
      { type: "M" as const, x: 0, y: 0 },
      { type: "L" as const, x: 1, y: 100 },
    ]).flat(),
    getBoundingBox: () => ({ x1: 0, y1: 0, x2: 1, y2: 100 }),
  } as ReturnType<typeof glyph.getPath>);
  expect(() => buildCurveAtlas([glyph], 1000)).toThrow("1024-curve");
});
