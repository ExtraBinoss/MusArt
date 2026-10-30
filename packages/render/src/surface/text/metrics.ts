import type { Font } from "text-shaper";
type API = Pick<typeof import("text-shaper"), "Face" | "getGlyphDelta">;
/** TrueType phantom-point metrics for imported variable fonts that omit HVAR. */
export function createMetricFace(font: Font, api: API) {
  class MetricFace extends api.Face {
    private readonly widths = new Map<number, number>();
    override setVariations(variations: Parameters<InstanceType<API["Face"]>["setVariations"]>[0]) {
      super.setVariations(variations);
      this.widths?.clear();
    }
    override advanceWidth(index: number): number {
      const width = super.advanceWidth(index),
        gvar = font.hvar ? null : font.gvar;
      if (!gvar || !this.normalizedCoords.some((value) => value !== 0)) return width;
      const cached = this.widths.get(index);
      if (cached !== undefined) return cached;
      const glyph = font.getGlyph(index);
      const count =
        glyph?.type === "simple"
          ? glyph.contours.reduce((sum, contour) => sum + contour.length, 0)
          : glyph?.type === "composite"
            ? glyph.components.length
            : 0;
      // Decode all four phantom deltas before reading a partial all-points tuple.
      api.getGlyphDelta(gvar, index, count + 3, this.normalizedCoords);
      const left = api.getGlyphDelta(gvar, index, count, this.normalizedCoords).x;
      const right = api.getGlyphDelta(gvar, index, count + 1, this.normalizedCoords).x;
      const result = width + right - left;
      this.widths.set(index, result);
      return result;
    }
  }
  return new MetricFace(font);
}
