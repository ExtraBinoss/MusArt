import type { Font } from "text-shaper";
import type { OutlineGlyph } from "./outlines";
import { acquirePositioning } from "./positioning";
import { createMetricFace } from "./metrics";
export interface ShapedGlyph {
  glyph: OutlineGlyph;
  advance: number;
  dx: number;
  dy: number;
  cluster: number;
}
const neutralScript = /[\p{Script=Common}\p{Script=Inherited}]/u;
/** Metadata only; all filled glyph coverage remains analytical Three/TSL. */
export async function createShaper(font: Font, getGlyph: (index: number) => OutlineGlyph) {
  const {
    Face,
    UnicodeBuffer,
    GlyphBuffer,
    shapeInto,
    getScript,
    getScriptDirection,
    Script,
    Direction,
    BufferFlags,
    getGlyphDelta,
  } = await import("text-shaper");
  let owner:
    | {
        face: InstanceType<typeof Face>;
        input: InstanceType<typeof UnicodeBuffer>;
        output: InstanceType<typeof GlyphBuffer>;
        weight: number;
        positioning: ReturnType<typeof acquirePositioning>;
        getGlyph: typeof getGlyph;
      }
    | undefined = {
    face: createMetricFace(font, { Face, getGlyphDelta }),
    input: new UnicodeBuffer(),
    output: GlyphBuffer.withCapacity(128),
    weight: NaN,
    positioning: acquirePositioning(font),
    getGlyph,
  };
  return {
    shape(text: string, weight: number): ShapedGlyph[] {
      if (!owner) throw Error("Font shaper is disposed.");
      const { face, input, output } = owner;
      if (owner.weight !== weight) {
        face.setVariations({ wght: weight, opsz: 14 });
        owner.weight = weight;
      }
      owner.positioning.apply(face.normalizedCoords);
      const normalized = text.normalize("NFC");
      input.clear().setLanguage(null).setFlags(BufferFlags.Default).addStr(normalized);
      let script = Script.Common,
        offset = 0;
      for (let i = 0; i < input.codepoints.length; i++) {
        let codepoint = input.codepoints[i]!;
        if (codepoint >= 0xd800 && codepoint <= 0xdfff) input.codepoints[i] = codepoint = 0xfffd;
        input.clusters[i] = offset;
        offset += codepoint > 0xffff ? 2 : 1;
        if (script === Script.Common) {
          // Upstream0.1.28 marks the entire Basic Latin block Common; ASCII letters
          // must select latn so token layout receives script-specific kerning.
          const detected =
            (codepoint >= 65 && codepoint <= 90) || (codepoint >= 97 && codepoint <= 122)
              ? Script.Latin
              : neutralScript.test(String.fromCodePoint(codepoint))
                ? Script.Common
                : getScript(codepoint);
          if (
            detected !== Script.Common &&
            detected !== Script.Inherited &&
            detected !== Script.Unknown
          )
            script = detected;
        }
      }
      const direction = getScriptDirection(script);
      input.setScript(script).setDirection(direction === "rtl" ? Direction.RTL : Direction.LTR);
      try {
        shapeInto(face, input, output, { script: script.toLowerCase(), direction, language: null });
        const shaped: ShapedGlyph[] = [];
        for (let i = 0; i < output.length; i++) {
          const info = output.infos[i]!,
            position = output.positions[i]!;
          shaped.push({
            glyph: owner.getGlyph(info.glyphId),
            advance: position.xAdvance,
            dx: position.xOffset,
            dy: position.yOffset,
            cluster: info.cluster,
          });
        }
        return shaped;
      } finally {
        const oversized = input.length > 8192 || output.length > 8192;
        input.clear();
        output.reset();
        // Valid long tokens are shaped in full, but idle faces must not retain their peak pools.
        if (oversized && owner) {
          owner.input = new UnicodeBuffer();
          owner.output = GlyphBuffer.withCapacity(128);
        }
      }
    },
    dispose() {
      owner?.input.clear();
      owner?.output.reset();
      owner?.positioning.dispose();
      owner = undefined;
    },
  };
}
