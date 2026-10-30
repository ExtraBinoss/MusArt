import type { Layer } from "@musart/core";
import type { OutlineGlyph } from "./outlines";
import { weightedGlyph, type OutlineFont } from "./fonts";
import type { ShapedGlyph } from "./shaping";

export interface PlacedGlyph {
  glyph: OutlineGlyph;
  x: number;
  baseline: number;
}
interface LineEntry {
  item: ShapedGlyph;
  whitespace: boolean;
  indent: boolean;
  width: number;
}

/** Shape tokens once, preserve explicit indentation, and stop after the visible line range. */
export function layoutText(layer: Layer, font: OutlineFont): PlacedGlyph[] {
  const scale = layer.fontSize / font.unitsPerEm,
    lineHeight = layer.fontSize * layer.lineHeight,
    limit = Math.ceil(layer.height / lineHeight);
  const shape = (text: string): ShapedGlyph[] => {
    if (font.shape) return font.shape(text, layer.fontWeight);
    return font.stringToGlyphs(text.normalize("NFC")).map((glyph, index, glyphs) => ({
      glyph,
      advance: glyph.advanceWidth ?? 0,
      dx: index ? font.getKerningValue(glyphs[index - 1]!, glyph) : 0,
      dy: 0,
      cluster: index,
    }));
  };
  const lines: { glyphs: ShapedGlyph[]; width: number }[] = [];
  let line: LineEntry[] = [],
    width = 0,
    hasInk = false,
    softLeading = false;
  const advance = (item: ShapedGlyph, hasPrevious: boolean) =>
    (item.advance + (font.shape ? 0 : item.dx)) * scale + (hasPrevious ? layer.letterSpacing : 0);
  const finish = (soft: boolean): boolean => {
    if (soft) {
      while (line.at(-1)?.whitespace && !line.at(-1)!.indent) width -= line.pop()!.width;
    }
    lines.push({ glyphs: line.map(({ item }) => item), width });
    line = [];
    width = 0;
    hasInk = false;
    softLeading = soft;
    return lines.length < limit;
  };
  paragraphs: for (const paragraph of layer.text.replaceAll("\t", "    ").split(/\r?\n/)) {
    const before = lines.length;
    let paragraphHasInk = false;
    softLeading = false;
    for (const [token] of paragraph.matchAll(/\s+|\S+/gu)) {
      const whitespace = /^\s+$/u.test(token),
        indent = whitespace && !paragraphHasInk;
      if (!whitespace) paragraphHasInk = true;
      if (whitespace && !line.length && softLeading) continue;
      const glyphs = shape(token),
        tokenWidth = glyphs.reduce(
          (sum, glyph, index) => sum + advance(glyph, index > 0 || line.length > 0),
          0,
        );
      if (hasInk && !whitespace && width + tokenWidth > layer.width && !finish(true))
        break paragraphs;
      for (const item of glyphs) {
        if (line.length && width + advance(item, true) > layer.width && !finish(true))
          break paragraphs;
        if (!line.length && softLeading && whitespace) continue;
        const size = advance(item, line.length > 0);
        line.push({ item, whitespace, indent, width: size });
        width += size;
        if (!whitespace) hasInk = true;
      }
    }
    // A wrap at the final separator already finished this paragraph's last line.
    if ((line.length || lines.length === before) && !finish(false)) break;
  }
  const output: PlacedGlyph[] = [];
  for (const [index, current] of lines.entries()) {
    const baseline = index * lineHeight + font.ascender * scale;
    let x =
      layer.textAlign === "center"
        ? (layer.width - current.width) / 2
        : layer.textAlign === "right"
          ? layer.width - current.width
          : 0;
    for (const [position, item] of current.glyphs.entries()) {
      if (position) x += layer.letterSpacing;
      const glyph = weightedGlyph(font, item.glyph, layer.fontWeight);
      output.push({ glyph, x: x + item.dx * scale, baseline: baseline - item.dy * scale });
      x += item.advance * scale + (font.shape ? 0 : item.dx * scale);
    }
  }
  return output;
}
