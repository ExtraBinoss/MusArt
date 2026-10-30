import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import * as api from "text-shaper";
import { acquirePositioning } from "../../../src/surface/text/positioning";
import { gdefStore, pairPositioning, replaceSfntTable } from "../../support/text-variation";

async function fixture(format: 1 | 2) {
  let bytes = new Uint8Array(await readFile("apps/web/public/fonts/inter/font.ttf")).buffer;
  const original = api.Font.load(bytes);
  const first = original.glyphIdForChar("A"),
    second = original.glyphIdForChar("V");
  const axes = original.fvar!.axes,
    weightAxis = axes.findIndex((axis) => axis.tag === api.tag("wght"));
  bytes = replaceSfntTable(bytes, "GPOS", pairPositioning(format, first, second));
  bytes = replaceSfntTable(bytes, "GDEF", gdefStore(axes.length, weightAxis));
  return api.Font.load(bytes);
}

test.each([1, 2] as const)(
  "resolves all four fields of both PairPos format%s records without accumulating deltas",
  async (format) => {
    const font = await fixture(format),
      first = acquirePositioning(font),
      second = acquirePositioning(font);
    const face = new api.Face(font),
      input = new api.UnicodeBuffer().addStr("AV"),
      output = api.GlyphBuffer.withCapacity(8);
    for (const [weight, advance, delta] of [
      [100, 1310, 0],
      [800, 1576, 46],
      [100, 1310, 0],
    ]) {
      face.setVariations({ wght: weight, opsz: 14 });
      (weight === 800 ? second : first).apply(face.normalizedCoords);
      api.shapeInto(face, input, output, { script: "latn", direction: "ltr" });
      expect(output.positions).toMatchObject([
        {
          xAdvance: advance! + 5 + delta!,
          yAdvance: 6 + delta!,
          xOffset: 3 + delta!,
          yOffset: 4 + delta!,
        },
        {
          xAdvance: advance! + 9 + delta!,
          yAdvance: 10 + delta!,
          xOffset: 7 + delta!,
          yOffset: 8 + delta!,
        },
      ]);
    }
    first.dispose();
    first.dispose();
    second.dispose();
    const lookup = font.gpos!.lookups[0]!;
    if (lookup.type !== 2) throw Error("Pair fixture was not parsed");
    const subtable = lookup.subtables[0]!;
    const record =
      subtable.format === 1
        ? subtable.pairSets[0]!.pairValueRecords[0]!.value1
        : subtable.class1Records[0]!.class2Records[0]!.value1;
    expect(record).toMatchObject({ xPlacement: 3, yPlacement: 4, xAdvance: 5, yAdvance: 6 });
    expect(() => first.apply(face.normalizedCoords)).toThrow("disposed");
  },
);

test("shares one original-value owner across independent leases and restores absent fields and anchor coordinates", () => {
  const bytes = gdefStore(1, 0),
    record = {
      xPlacement: 3,
      xPlaDevice: { deltaSetOuterIndex: 0, deltaSetInnerIndex: 0 },
      xAdvDevice: { deltaSetOuterIndex: 0, deltaSetInnerIndex: 0 },
    };
  const anchor = {
    xCoordinate: 20,
    yCoordinate: 30,
    xDevice: { deltaSetOuterIndex: 0, deltaSetInnerIndex: 0 },
    yDevice: { deltaSetOuterIndex: 0, deltaSetInnerIndex: 0 },
  };
  const font = {
    isVariable: true,
    getTableReader: () => new api.Reader(bytes.buffer),
    gpos: { lookups: [{ record, anchor }] },
  } as unknown as api.Font;
  const a = acquirePositioning(font),
    b = acquirePositioning(font);
  a.apply([1]);
  expect(record.xPlacement).toBe(63);
  expect(anchor).toMatchObject({ xCoordinate: 80, yCoordinate: 90 });
  b.apply([0.5]);
  expect(record.xPlacement).toBe(33);
  expect(anchor.xCoordinate).toBe(50);
  a.apply([1]);
  expect(record.xPlacement).toBe(63);
  a.dispose();
  b.dispose();
  expect(record.xPlacement).toBe(3);
  expect(record).not.toHaveProperty("xAdvance");
  expect(anchor).toMatchObject({ xCoordinate: 20, yCoordinate: 30 });
});

test("leaves static fonts and fonts without a positioning variation store untouched", () => {
  const font = { isVariable: false } as api.Font;
  const lease = acquirePositioning(font);
  lease.apply([]);
  lease.dispose();
  lease.dispose();
});

test.each([1, 2] as const)(
  "consumes both positioned glyphs for nonempty value2 in PairPos format%s",
  async (format) => {
    let bytes = new Uint8Array(await readFile("apps/web/public/fonts/inter/font.ttf")).buffer;
    const original = api.Font.load(bytes),
      glyph = original.glyphIdForChar("A"),
      axes = original.fvar!.axes;
    bytes = replaceSfntTable(bytes, "GPOS", pairPositioning(format, glyph, glyph));
    bytes = replaceSfntTable(
      bytes,
      "GDEF",
      gdefStore(
        axes.length,
        axes.findIndex((axis) => axis.tag === api.tag("wght")),
      ),
    );
    const font = api.Font.load(bytes),
      face = new api.Face(font, { wght: 400, opsz: 14 });
    const positions = acquirePositioning(font);
    positions.apply(face.normalizedCoords);
    const input = new api.UnicodeBuffer().addStr("AAA"),
      output = api.GlyphBuffer.withCapacity(8);
    api.shapeInto(face, input, output, { script: "latn", direction: "ltr" });
    // Actual HB0.4.15 oracle from the same original SFNT fixture, not text-shaper output.
    expect(output.positions.map((p) => [p.xAdvance, p.xOffset, p.yOffset])).toEqual([
      [1418, 3, 4],
      [1422, 7, 8],
      [1413, 0, 0],
    ]);
    positions.dispose();
  },
);
