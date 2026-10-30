import * as api from "text-shaper";
import { buildCurveAtlas } from "../../../../packages/render/src/surface/text/atlas";
import { createOutlineFont } from "../../../../packages/render/src/surface/text/outlines";
import { createShaper } from "../../../../packages/render/src/surface/text/shaping";
import { weightedGlyph } from "../../../../packages/render/src/surface/text/fonts";
import { layoutText } from "../../../../packages/render/src/surface/text/layout";
import { quadraticCurves } from "../../../../packages/render/src/surface/text/curves";
import type { Prepared } from "./backend";
/** Actual production adapters, including the repository's owned resolver-byte copy. */
export async function prepare(bytes: ArrayBuffer): Promise<Prepared> {
  const start = performance.now();
  const native = api.Font.load(new Uint8Array(bytes).slice().buffer);
  const outlines = createOutlineFont(native, api);
  const parseMs = performance.now() - start,
    setup = performance.now();
  const shaper = await createShaper(native, (index) => outlines.font.glyphs.get(index));
  const shaperSetupMs = performance.now() - setup;
  outlines.font.shape = (text, weight) => shaper.shape(text, weight);
  return {
    font: outlines.font,
    timings: { parseMs, shaperSetupMs },
    weightedGlyph,
    layoutText,
    quadraticCurves,
    buildCurveAtlas,
    dispose() {
      shaper.dispose();
      outlines.dispose();
    },
  };
}
