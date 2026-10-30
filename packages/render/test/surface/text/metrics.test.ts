import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import * as api from "text-shaper";
import { createMetricFace } from "../../../src/surface/text/metrics";
import { removeHvar } from "../../support/text-variation";

test("preserves HarfBuzz phantom advances for simple and composite glyphs when a variable font omits HVAR", async () => {
  const source = new Uint8Array(await readFile("apps/web/public/fonts/inter/font.ttf")).buffer;
  const font = api.Font.load(removeHvar(source)),
    face = createMetricFace(font, api);
  expect(font.hvar).toBeNull();
  expect(font.gvar).not.toBeNull();
  const a = font.glyphIdForChar("A"),
    accent = font.glyphIdForChar("é");
  for (const [weight, advance, accentAdvance] of [
    [100, 1310, 1172],
    [400, 1413, 1194],
    [800, 1576, 1230],
    [100, 1310, 1172],
  ]) {
    face.setVariations({ wght: weight, opsz: 14 });
    expect(face.advanceWidth(a)).toBe(advance);
    expect(face.advanceWidth(a)).toBe(advance);
    expect(face.advanceWidth(accent)).toBe(accentAdvance);
  }
});

test("keeps static and HVAR metrics on the public Face path", async () => {
  for (const file of ["inter/font.ttf", "tinos/font.ttf"]) {
    const font = api.Font.load(
      new Uint8Array(await readFile(`apps/web/public/fonts/${file}`)).buffer,
    );
    const face = createMetricFace(font, api),
      reference = new api.Face(font);
    for (const weight of [100, 400, 800]) {
      face.setVariations({ wght: weight, opsz: 14 });
      reference.setVariations({ wght: weight, opsz: 14 });
      for (const text of ["A", "é", " "])
        expect(face.advanceWidth(font.glyphIdForChar(text))).toBe(
          reference.advanceWidth(font.glyphIdForChar(text)),
        );
    }
  }
});
