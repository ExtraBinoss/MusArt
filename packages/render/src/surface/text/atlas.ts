import type { Glyph } from "opentype.js";
import { DataTexture, FloatType, NearestFilter, NoColorSpace, RGBAFormat } from "three/webgpu";
import { quadraticCurves } from "./curves";

export interface GlyphBand {
  index: number;
  bounds: readonly [number, number, number, number];
  header: number;
  bands: number;
  advance: number;
}
export interface CurveAtlas {
  texture: DataTexture;
  width: number;
  glyphs: Map<number, GlyphBand>;
  bytes: number;
}
/** Slug-style horizontal/vertical band lists; no raster glyph atlas or distance field. */
export function buildCurveAtlas(glyphs: Glyph[], unitsPerEm: number): CurveAtlas {
  const data: number[] = [],
    records = new Map<number, GlyphBand>();
  for (const glyph of glyphs) {
    if (records.has(glyph.index)) continue;
    const path = glyph.getPath(0, 0, unitsPerEm, { xScale: 1, yScale: 1 }),
      curves = quadraticCurves(path.commands);
    const box = path.getBoundingBox();
    const width = Math.max(0, box.x2 - box.x1),
      height = Math.max(0, box.y2 - box.y1);
    const bands = 16,
      curveBase = data.length / 4;
    for (const curve of curves) data.push(...curve.p0, ...curve.p1, ...curve.p2, 0, 0);
    const header = data.length / 4;
    data.push(...Array.from({ length: bands * 2 * 4 }, () => 0));
    for (let axis = 0; axis < 2; axis++) {
      const min = axis === 0 ? box.y1 : box.x1,
        span = axis === 0 ? height : width;
      for (let band = 0; band < bands; band++) {
        const start = data.length / 4,
          lower = min + (span * band) / bands,
          upper = min + (span * (band + 1)) / bands;
        for (const [index, curve] of curves.entries()) {
          const positions = [curve.p0[1 - axis]!, curve.p1[1 - axis]!, curve.p2[1 - axis]!];
          if (
            Math.max(...positions) < lower ||
            Math.min(...positions) > upper ||
            positions.every((v) => v === positions[0])
          )
            continue;
          data.push(curveBase + index * 2, 0, 0, 0);
        }
        const count = data.length / 4 - start;
        if (count > 1024) throw new Error("Glyph band exceeds the 1024-curve limit.");
        const offset = (header + axis * bands + band) * 4;
        data[offset] = start;
        data[offset + 1] = count;
      }
    }
    records.set(glyph.index, {
      index: glyph.index,
      bounds: [box.x1, box.y1, width, height],
      header,
      bands,
      advance: glyph.advanceWidth ?? 0,
    });
  }
  const texels = Math.max(1, data.length / 4),
    width = Math.min(2048, 2 ** Math.ceil(Math.log2(Math.ceil(Math.sqrt(texels))))),
    height = Math.ceil(texels / width);
  if (height > 2048) throw new Error("Text curve atlas exceeds the 64 MiB limit.");
  const pixels = new Float32Array(width * height * 4);
  pixels.set(data);
  const texture = new DataTexture(pixels, width, height, RGBAFormat, FloatType);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  return { texture, width, glyphs: records, bytes: pixels.byteLength };
}
