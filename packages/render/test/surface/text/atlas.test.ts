import { expect, it, vi } from "vitest";
import type { Glyph, PathCommand } from "opentype.js";
import { FloatType, NearestFilter, NoColorSpace, RGBAFormat } from "three/webgpu";
import { buildCurveAtlas, type CurveAtlas, type GlyphBand } from "../../../src/surface/text/atlas";
import { outlineFont } from "../../text-fixture";

function fixture(commands: PathCommand[], bounds: [number, number, number, number]): Glyph {
  const glyph = outlineFont().charToGlyph("A");
  vi.spyOn(glyph, "getPath").mockReturnValue({
    commands,
    getBoundingBox: () => ({ x1: bounds[0], y1: bounds[1], x2: bounds[2], y2: bounds[3] }),
  } as ReturnType<typeof glyph.getPath>);
  return glyph;
}
function band(atlas: CurveAtlas, glyph: GlyphBand, axis: number, index: number): number[] {
  const data = atlas.texture.image.data as Float32Array,
    header = (glyph.header + axis * glyph.bands + index) * 4,
    start = data[header]!,
    count = data[header + 1]!;
  return Array.from({ length: count }, (_, offset) => data[(start + offset) * 4]!);
}

it("packs exact curves and dual-axis bands, deduplicates glyph indices and tracks allocations", () => {
  const font = outlineFont(),
    glyph = font.charToGlyph("A"),
    atlas = buildCurveAtlas([glyph, glyph, font.charToGlyph(" ")], font.unitsPerEm),
    empty = buildCurveAtlas([], 1000);
  try {
    expect(atlas.glyphs.size).toBe(2);
    const record = atlas.glyphs.get(glyph.index)!;
    expect(record.bounds).toEqual([0, -700, 500, 700]);
    const data = atlas.texture.image.data as Float32Array;
    expect(data[record.header * 4 + 1]).toBe(2);
    expect(data[(record.header + 16) * 4 + 1]).toBe(2);
    expect(atlas.texture.type).toBe(FloatType);
    expect(atlas.texture.format).toBe(RGBAFormat);
    expect(atlas.texture.minFilter).toBe(NearestFilter);
    expect(atlas.texture.magFilter).toBe(NearestFilter);
    expect(atlas.texture.colorSpace).toBe(NoColorSpace);
    expect(atlas.texture.generateMipmaps).toBe(false);
    expect(atlas.bytes).toBe(data.byteLength);
    expect(empty.bytes).toBe(16);
    expect(empty.glyphs.size).toBe(0);
  } finally {
    atlas.texture.dispose();
    empty.texture.dispose();
  }
});

it.each([0, 1])(
  "sorts axis%s bands by descending control-point maximum with stable ties and original curve addresses",
  (axis) => {
    const swap = (x: number, y: number) => (axis ? { x: y, y: x } : { x, y });
    const commands: PathCommand[] = [];
    for (const [start, control] of [
      [-3, 20],
      [10, 15],
      [0, 20],
    ] as const) {
      const p0 = swap(start, -8),
        p1 = swap(control, 0),
        p2 = swap(start, 8);
      commands.push({ type: "M", ...p0 }, { type: "Q", x1: p1.x, y1: p1.y, ...p2 });
    }
    const glyph = fixture(commands, axis ? [-8, -3, 8, 20] : [-3, -8, 20, 8]),
      atlas = buildCurveAtlas([glyph], 1000);
    try {
      const record = atlas.glyphs.get(glyph.index)!;
      // Control-point20 sorts first even though both endpoints are only -3/0.
      expect(band(atlas, record, axis, 0)).toEqual([0, 8, 4, 6, 10, 2]);
      expect(Array.from((atlas.texture.image.data as Float32Array).slice(0, 8))).toEqual(
        axis ? [-8, -3, 0, 20, 8, -3, 0, 0] : [-3, -8, 20, 0, -3, 8, 0, 0],
      );
      expect(record.header).toBe(12);
      expect(record.bands).toBe(16);
    } finally {
      atlas.texture.dispose();
    }
  },
);

it.each([32, 1000, 2048])(
  "extends band membership by exactly unitsPerEm/1024 at both edges for UPE%s",
  (units) => {
    const epsilon = units / 1024,
      height = units / 16;
    for (const axis of [0, 1])
      for (const direction of [-1, 1])
        for (const distance of [0.5, 1, 1.5]) {
          const lower = 8 * height,
            upper = 9 * height,
            from = direction > 0 ? upper + epsilon * distance : 7 * height,
            to = direction > 0 ? 10 * height : lower - epsilon * distance,
            a = axis ? { x: from, y: 4 * height } : { x: 4 * height, y: from },
            b = axis ? { x: to, y: 4 * height } : { x: 4 * height, y: to };
          const glyph = fixture(
              [
                { type: "M", ...a },
                { type: "L", ...b },
                { type: "M", x: 0, y: 0 },
                { type: "L", x: units, y: units },
              ],
              [0, 0, units, units],
            ),
            atlas = buildCurveAtlas([glyph], units);
          try {
            const members = band(atlas, atlas.glyphs.get(glyph.index)!, axis, 8);
            expect(members.includes(0), `axis${axis}/edge${direction}/epsilon${distance}`).toBe(
              distance <= 1,
            );
            expect(members.includes(2)).toBe(distance <= 1);
          } finally {
            atlas.texture.dispose();
          }
        }
  },
);

it("excludes parallel lines from their ray bands and preserves exact straight contours", () => {
  const glyph = fixture(
      [
        { type: "M", x: 0, y: 0 },
        { type: "L", x: 16, y: 0 },
        { type: "L", x: 16, y: 16 },
        { type: "L", x: 0, y: 16 },
        { type: "Z" },
      ],
      [0, 0, 16, 16],
    ),
    atlas = buildCurveAtlas([glyph], 1000);
  try {
    const record = atlas.glyphs.get(glyph.index)!;
    for (let index = 0; index < record.bands; index++) {
      expect(band(atlas, record, 0, index)).toEqual([2, 6]);
      expect(band(atlas, record, 1, index)).toEqual([4, 0]);
    }
    expect(Array.from((atlas.texture.image.data as Float32Array).slice(0, 16))).toEqual([
      0, 0, 8, 0, 16, 0, 0, 0, 16, 0, 16, 8, 16, 16, 0, 0,
    ]);
  } finally {
    atlas.texture.dispose();
  }
});

it("keeps integer F32 headers/references within the atlas, including an empty glyph", () => {
  const font = outlineFont(),
    glyph = font.charToGlyph("A"),
    empty = font.charToGlyph(" "),
    atlas = buildCurveAtlas([glyph, empty], font.unitsPerEm);
  try {
    const data = atlas.texture.image.data as Float32Array,
      texels = data.length / 4;
    for (const record of atlas.glyphs.values()) {
      expect(record.header + record.bands * 2).toBeLessThanOrEqual(texels);
      for (let axis = 0; axis < 2; axis++)
        for (let index = 0; index < record.bands; index++) {
          const offset = (record.header + axis * record.bands + index) * 4,
            start = data[offset]!,
            count = data[offset + 1]!;
          expect(Number.isInteger(start)).toBe(true);
          expect(Number.isInteger(count)).toBe(true);
          expect(start).toBeGreaterThanOrEqual(record.header + record.bands * 2);
          expect(start + count).toBeLessThanOrEqual(texels);
          expect(count).toBeLessThanOrEqual(1024);
          for (const pointer of band(atlas, record, axis, index)) {
            expect(Number.isInteger(pointer)).toBe(true);
            expect(pointer + 1).toBeLessThan(record.header);
          }
        }
    }
    expect(band(atlas, atlas.glyphs.get(empty.index)!, 0, 0)).toEqual([]);
  } finally {
    atlas.texture.dispose();
  }
});

it("accepts exactly1024 references per band, rejects overflow before allocation and remains disposable", () => {
  const path = (segments: number): PathCommand[] =>
    Array.from({ length: segments }, () => [
      { type: "M" as const, x: 0, y: 0 },
      { type: "L" as const, x: 1, y: 100 },
    ]).flat();
  const atlas = buildCurveAtlas([fixture(path(512), [0, 0, 1, 100])], 1000),
    disposed = vi.fn();
  const record = atlas.glyphs.values().next().value!;
  expect(band(atlas, record, 0, 0)).toHaveLength(1024);
  expect(band(atlas, record, 1, 0)).toHaveLength(1024);
  atlas.texture.addEventListener("dispose", disposed);
  atlas.texture.dispose();
  expect(disposed).toHaveBeenCalledOnce();
  expect(() => buildCurveAtlas([fixture(path(513), [0, 0, 1, 100])], 1000)).toThrow("1024-curve");
});
