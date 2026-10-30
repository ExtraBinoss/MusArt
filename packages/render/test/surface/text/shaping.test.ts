import { afterEach, expect, test, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { shapingReference } from "../../support/text-shaping-reference";
import * as api from "text-shaper";
import { createOutlineFont } from "../../../src/surface/text/outlines";
import { createLayer } from "@musart/core";
import { layoutText } from "../../../src/surface/text/layout";
import { createShaper } from "../../../src/surface/text/shaping";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fixture(file = "inter/font.ttf") {
  const bytes = new Uint8Array(await readFile(`apps/web/public/fonts/${file}`)).buffer;
  const native = api.Font.load(bytes),
    outlines = createOutlineFont(native, api);
  const shaper = await createShaper(native, (index) => outlines.font.glyphs.get(index));
  return {
    native,
    outlines,
    shaper,
    dispose() {
      shaper.dispose();
      outlines.dispose();
    },
  };
}

test("shapes real kerning, ligatures, NFC accents and variation advances without fetching/rasterizing", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const { shaper, dispose } = await fixture();
  const combined = shaper.shape("AV", 400),
    separate = [...shaper.shape("A", 400), ...shaper.shape("V", 400)];
  expect(combined.reduce((sum, item) => sum + item.advance, 0)).toBeLessThan(
    separate.reduce((sum, item) => sum + item.advance, 0),
  );
  expect(shaper.shape("Café", 400)).toEqual(shaper.shape("Cafe\u0301", 400));
  expect(shaper.shape("office", 400).every((item) => item.glyph.index > 0)).toBe(true);
  expect(shaper.shape("AV", 800).map((item) => item.advance)).not.toEqual(
    combined.map((item) => item.advance),
  );
  expect(shaper.shape("", 400)).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
  dispose();
  dispose();
  expect(() => shaper.shape("A", 400)).toThrow("disposed");
});

test("preserves UTF16 cluster offsets after astral codepoints and NFC normalization", async () => {
  const { shaper, dispose } = await fixture();
  // Missing emoji outlines remain honest; this asserts metadata indices, not emoji rendering.
  expect(shaper.shape("A😀e\u0301", 400).map((item) => item.cluster)).toEqual([0, 1, 3]);
  const malformed = shaper.shape("A\ud800B", 400),
    replacement = shaper.shape("A\ufffdB", 400);
  expect(malformed.map((item) => [item.glyph.index, item.cluster])).toEqual(
    replacement.map((item) => [item.glyph.index, item.cluster]),
  );
  dispose();
});

test("resets direction and script between actual Hebrew, Latin and punctuation tokens", async () => {
  const { shaper, dispose } = await fixture("arimo/font.ttf");
  const hebrew = shaper.shape("שלום", 400);
  expect(hebrew.every((item) => item.glyph.index > 0)).toBe(true);
  expect(hebrew.map((item) => item.cluster)).toEqual([3, 2, 1, 0]);
  expect(shaper.shape("«שלום", 400).map((item) => item.cluster)).toEqual([4, 3, 2, 1, 0]);
  expect(shaper.shape("123—שלום", 400).map((item) => item.cluster)).toEqual([
    7, 6, 5, 4, 3, 2, 1, 0,
  ]);
  expect(shaper.shape("ABC", 400).map((item) => item.cluster)).toEqual([0, 1, 2]);
  expect(shaper.shape("  ", 400).map((item) => item.cluster)).toEqual([0, 1]);
  dispose();
});

test("returns independent positions that survive subsequent reuse of the shaping buffers", async () => {
  const { shaper, dispose } = await fixture();
  const before = shaper.shape("AVATAR", 400);
  const snapshot = before.map(({ glyph, ...position }) => [glyph.index, position]);
  shaper.shape("Café office", 800);
  expect(before.map(({ glyph, ...position }) => [glyph.index, position])).toEqual(snapshot);
  dispose();
});

test("retires oversized reusable pools after processing every glyph of a valid long token", async () => {
  const allocate = vi.spyOn(api.GlyphBuffer, "withCapacity");
  const { shaper, dispose } = await fixture();
  const initial = allocate.mock.calls.length;
  expect(shaper.shape("A".repeat(8193), 400)).toHaveLength(8193);
  expect(allocate.mock.calls.length).toBe(initial + 1);
  expect(shaper.shape("AV", 400)).toHaveLength(2);
  dispose();
});

test("clears reusable input/output after an outline lookup failure and allows the next shape", async () => {
  const bytes = new Uint8Array(await readFile("apps/web/public/fonts/inter/font.ttf")).buffer;
  const font = api.Font.load(bytes),
    outlines = createOutlineFont(font, api);
  let fail = true;
  const shaper = await createShaper(font, (index) => {
    if (fail) throw Error("glyph lookup failed");
    return outlines.font.glyphs.get(index);
  });
  expect(() => shaper.shape("AV", 400)).toThrow("glyph lookup failed");
  fail = false;
  expect(shaper.shape("Café", 800)).toHaveLength(4);
  shaper.dispose();
  outlines.dispose();
});

test.each(shapingReference)(
  "preserves the independent HarfBuzz glyph/position/cluster oracle for $id",
  async (item) => {
    const data = new Uint8Array(await readFile(`apps/web/public/fonts/${item.file}`));
    expect(createHash("sha256").update(data).digest("hex")).toBe(item.fontSha256);
    const native = api.Font.load(data.buffer),
      outlines = createOutlineFont(native, api);
    const shaper = await createShaper(native, (index) => outlines.font.glyphs.get(index));
    const signature = shaper
      .shape(item.text, item.weight)
      .map((g) => [g.glyph.index, g.advance, g.dx, g.dy, g.cluster]);
    expect(createHash("sha256").update(JSON.stringify(signature)).digest("hex")).toBe(
      item.signatureSha256,
    );
    outlines.font.shape = (text, weight) => shaper.shape(text, weight);
    const placed = layoutText(
      createLayer("text", {
        ...item.layout,
        text: item.text,
        fontWeight: item.weight,
        lineHeight: 1.2,
      }),
      outlines.font,
    );
    expect(
      createHash("sha256")
        .update(JSON.stringify(placed.map((g) => [g.glyph.index, g.x, g.baseline])))
        .digest("hex"),
    ).toBe(item.layoutSha256);
    shaper.dispose();
    outlines.dispose();
  },
);

test("keeps two shapers over one Font independent across cached variation plans and disposal", async () => {
  const bytes = new Uint8Array(await readFile("apps/web/public/fonts/inter/font.ttf")).buffer;
  const native = api.Font.load(bytes),
    outlines = createOutlineFont(native, api);
  const first = await createShaper(native, (index) => outlines.font.glyphs.get(index));
  const second = await createShaper(native, (index) => outlines.font.glyphs.get(index));
  const advances = (shaper: typeof first, weight: number) =>
    shaper.shape("AV", weight).map((glyph) => glyph.advance);
  expect(advances(first, 100)).toEqual([1170, 1310]);
  expect(advances(second, 800)).toEqual([1406, 1576]);
  expect(advances(first, 100)).toEqual([1170, 1310]);
  first.dispose();
  expect(advances(second, 100)).toEqual([1170, 1310]);
  expect(advances(second, 800)).toEqual([1406, 1576]);
  second.dispose();
  outlines.dispose();
});

test("selects Latin for ASCII-only Lora tokens so standalone kerning matches HarfBuzz", async () => {
  const { shaper, dispose } = await fixture("lora/font.ttf");
  expect(shaper.shape("AVATAR", 700).map((g) => g.advance)).toEqual([590, 631, 615, 597, 668, 686]);
  expect(shaper.shape("office.", 700).map((g) => g.advance)).toEqual([
    562, 369, 667, 518, 538, 233,
  ]);
  dispose();
});
