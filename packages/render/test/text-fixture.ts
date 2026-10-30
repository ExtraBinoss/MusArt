import { Font, Glyph, Path } from "opentype.js";
import type { OutlineFont } from "../src/surface/text/fonts";
export function outlineFont(): Font & OutlineFont {
  const path = new Path();
  path.moveTo(0, 0);
  path.lineTo(500, 0);
  path.lineTo(500, 700);
  path.lineTo(0, 700);
  path.close();
  const glyphs = [new Glyph({ name: ".notdef", advanceWidth: 500, path })];
  for (const character of [" ", "A", "V", "B", "é", "😀"])
    glyphs.push(
      new Glyph({
        index: glyphs.length,
        name: character === " " ? "space" : character,
        unicode: character.codePointAt(0),
        advanceWidth: character === " " ? 250 : 500,
        path: character === " " ? new Path() : path,
      }),
    );
  const font = new Font({
    familyName: "Test",
    styleName: "Regular",
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs,
  }) as Font & OutlineFont;
  font.kerningPairs = { "2,3": -100 };
  return font;
}
