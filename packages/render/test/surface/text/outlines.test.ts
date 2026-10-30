import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { Font as OpenTypeFont, Glyph, Path, parse } from "opentype.js";
import * as api from "text-shaper";
import { outlineReference } from "../../support/text-outline-reference";
import { createOutlineFont, outlineBounds } from "../../../src/surface/text/outlines";

test("finds exact quadratic/cubic extrema and preserves empty outlines", () => {
  expect(outlineBounds([])).toEqual({ x1: 0, y1: 0, x2: 0, y2: 0 });
  expect(
    outlineBounds([
      { type: "M", x: 0, y: 0 },
      { type: "Q", x1: 100, y1: 100, x: 200, y: 0 },
      { type: "Z" },
    ]),
  ).toEqual({ x1: 0, y1: 0, x2: 200, y2: 50 });
  expect(
    outlineBounds([
      { type: "M", x: 0, y: 0 },
      { type: "C", x1: 0, y1: 100, x2: 100, y2: 100, x: 100, y: 0 },
    ]),
  ).toEqual({ x1: 0, y1: 0, x2: 100, y2: 75 });
  expect(
    outlineBounds([
      { type: "M", x: 0, y: 0 },
      { type: "C", x1: 10, y1: 10, x2: 20, y2: 20, x: 30, y: 30 },
    ]),
  ).toEqual({ x1: 0, y1: 0, x2: 30, y2: 30 });
});

test("keeps actual Inter variation outlines, Y orientation, scaling, and ownership", async () => {
  const bytes = new Uint8Array(await readFile("apps/web/public/fonts/inter/font.ttf")).buffer;
  const original = parse(bytes),
    native = api.Font.load(bytes),
    prepared = createOutlineFont(native, api);
  const glyph = prepared.font.charToGlyph("A");
  const reference = original
    .charToGlyph("A")
    .getPath(0, 0, original.unitsPerEm, { xScale: 1, yScale: 1 });
  const path = glyph.getPath(0, 0, native.unitsPerEm, { xScale: 1, yScale: 1 });
  expect(path.getBoundingBox()).toEqual(reference.getBoundingBox());
  expect(glyph).toBe(prepared.font.glyphs.get(glyph.index));
  const bold = prepared.font.variation!.getTransform(glyph, { wght: 800, opsz: 14 });
  expect(bold.getPath(0, 0, native.unitsPerEm).getBoundingBox()).not.toEqual(path.getBoundingBox());
  const scaled = bold.getPath(10, 20, native.unitsPerEm / 2).getBoundingBox();
  const bounds = bold.getPath(0, 0, native.unitsPerEm).getBoundingBox();
  expect(scaled).toEqual({
    x1: 10 + bounds.x1 / 2,
    y1: 20 + bounds.y1 / 2,
    x2: 10 + bounds.x2 / 2,
    y2: 20 + bounds.y2 / 2,
  });
  expect(prepared.font.charToGlyph(" ").getPath().getBoundingBox()).toEqual({
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
  });
  prepared.dispose();
  prepared.dispose();
  expect(() => prepared.font.charToGlyph("A")).toThrow("disposed");
  expect(() => bold.getPath(0, 0, native.unitsPerEm)).toThrow("disposed");
});

test("extracts real CFF cubic curves from an independently built OTF fixture", () => {
  const path = new Path();
  path.moveTo(0, 0);
  path.curveTo(0, 700, 500, 700, 500, 0);
  path.close();
  const source = new OpenTypeFont({
    familyName: "MusArt CFF witness",
    styleName: "Regular",
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs: [
      new Glyph({ name: ".notdef", advanceWidth: 500, path: new Path() }),
      new Glyph({ name: "A", unicode: 65, advanceWidth: 600, path }),
    ],
  });
  const bytes = source.toArrayBuffer(),
    original = parse(bytes),
    native = api.Font.load(bytes);
  expect(native.isCFF).toBe(true);
  const prepared = createOutlineFont(native, api),
    actual = prepared.font.charToGlyph("A").getPath(0, 0, 1000);
  expect(actual.commands.some((command) => command.type === "C")).toBe(true);
  expect(actual.getBoundingBox()).toEqual(
    original.charToGlyph("A").getPath(0, 0, 1000).getBoundingBox(),
  );
  prepared.dispose();
});

test("bounds the adapter glyph cache during continuous weight changes", async () => {
  const bytes = new Uint8Array(await readFile("apps/web/public/fonts/inter/font.ttf")).buffer;
  const prepared = createOutlineFont(api.Font.load(bytes), api),
    glyph = prepared.font.charToGlyph("A");
  const first = prepared.font.variation!.getTransform(glyph, { wght: 100, opsz: 14 });
  for (let wght = 101; wght < 700; wght++)
    prepared.font.variation!.getTransform(glyph, { wght, opsz: 14 });
  expect(prepared.font.variation!.getTransform(glyph, { wght: 100, opsz: 14 })).not.toBe(first);
  prepared.dispose();
});

test.each(outlineReference)(
  "matches independent FreeType variable composite bounds for $file $text at $weight",
  async (item) => {
    const native = api.Font.load(
      new Uint8Array(await readFile(`apps/web/public/fonts/${item.file}`)).buffer,
    );
    const prepared = createOutlineFont(native, api),
      glyph = prepared.font.charToGlyph(item.text);
    const varied = prepared.font.variation!.getTransform(glyph, { wght: item.weight, opsz: 14 });
    expect(
      varied.getPath(0, 0, native.unitsPerEm, { xScale: 1, yScale: 1 }).getBoundingBox(),
    ).toEqual(item.bounds);
    prepared.dispose();
  },
);

test("rejects missing outline tables, invalid glyph IDs and unavailable paths without pretending they are spaces", async () => {
  const bytes = new Uint8Array(await readFile("apps/web/public/fonts/inter/font.ttf")).buffer;
  const invalid = bytes.slice(0),
    view = new DataView(invalid);
  for (let i = 0; i < view.getUint16(4); i++)
    if (view.getUint32(12 + i * 16) === 0x676c7966) view.setUint32(12 + i * 16, 0x676c7958);
  expect(() => createOutlineFont(api.Font.load(invalid), api)).toThrow("outline table");
  const native = api.Font.load(bytes),
    prepared = createOutlineFont(native, api);
  for (const index of [-1, NaN, native.numGlyphs])
    expect(() => prepared.font.glyphs.get(index)).toThrow("glyph index");
  prepared.dispose();
  const unavailable = createOutlineFont(native, { ...api, getGlyphPath: () => null });
  expect(() => unavailable.font.charToGlyph("A").getPath()).toThrow("unavailable");
  unavailable.dispose();
});
