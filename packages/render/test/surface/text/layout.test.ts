import { expect, it, vi } from "vitest";
import { createLayer } from "@musart/core";
import { layoutText } from "../../../src/surface/text/layout";
import { outlineFont } from "../../text-fixture";
it("preserves kerning, spacing, newlines, wrap and Unicode glyphs", () => {
  const font = outlineFont(),
    layer = createLayer("text", {
      fontSize: 100,
      letterSpacing: 2,
      width: 110,
      height: 500,
      text: "AV B\né😀",
      lineHeight: 1.5,
    });
  const placed = layoutText(layer, font);
  expect(placed[1]!.x).toBe(42);
  expect(placed.map((item) => item.baseline)).toContain(230);
  expect(placed.find(({ glyph }) => glyph.unicode === 0x1f600)).toBeDefined();
  expect(layoutText({ ...layer, height: 1 }, font).every((item) => item.baseline === 80)).toBe(
    true,
  );
});
it.each(["center", "right"] as const)(
  "aligns %s lines and breaks overlong words safely",
  (textAlign) => {
    const font = outlineFont(),
      layer = createLayer("text", {
        text: "AAAA\tB",
        fontSize: 100,
        width: 110,
        height: 600,
        letterSpacing: 0,
        textAlign,
      });
    const placed = layoutText(layer, font);
    expect(placed[0]!.x).toBe(textAlign === "center" ? 5 : 10);
    expect(new Set(placed.map((item) => item.baseline)).size).toBeGreaterThan(1);
    expect(layoutText({ ...layer, text: "" }, font)).toEqual([]);
  },
);

it.each(["center", "right"] as const)(
  "drops wrap separators before computing %s alignment",
  (textAlign) => {
    const font = outlineFont(),
      placed = layoutText(
        createLayer("text", {
          text: "A A",
          fontSize: 100,
          lineHeight: 1,
          letterSpacing: 0,
          width: 90,
          height: 200,
          textAlign,
        }),
        font,
      );
    const letters = placed.filter(({ glyph }) => glyph.name === "A");
    expect(letters).toHaveLength(2);
    expect(letters.map(({ x }) => x)).toEqual(textAlign === "center" ? [20, 20] : [40, 40]);
    expect(letters.map(({ baseline }) => baseline)).toEqual([80, 180]);
    expect(placed.some(({ glyph }) => glyph.name === "space")).toBe(false);
  },
);

it("preserves explicit paragraph indentation and tabs without carrying wrapped break spaces", () => {
  const font = outlineFont(),
    layer = createLayer("text", {
      text: " A\n\tB",
      fontSize: 100,
      letterSpacing: 0,
      width: 300,
      height: 400,
      lineHeight: 1,
    });
  const placed = layoutText(layer, font);
  expect(placed.find(({ glyph }) => glyph.name === "A")?.x).toBe(25);
  expect(placed.find(({ glyph }) => glyph.name === "B")?.x).toBe(100);
  expect(placed.find(({ glyph }) => glyph.name === "B")?.baseline).toBe(180);
  const wrapped = layoutText({ ...layer, text: "AA    B", width: 110 }, font);
  expect(wrapped.find(({ glyph }) => glyph.name === "B")?.x).toBe(0);
  expect(wrapped.find(({ glyph }) => glyph.name === "B")?.baseline).toBe(180);
});

it("does not shape offscreen paragraph tails after the visible line budget is full", () => {
  const font = outlineFont(),
    shape = vi.spyOn(font, "stringToGlyphs"),
    layer = createLayer("text", {
      text: "A\n" + "B\n".repeat(10000),
      fontSize: 100,
      lineHeight: 1,
      width: 100,
      height: 100,
    });
  const placed = layoutText(layer, font);
  expect(placed.map(({ glyph }) => glyph.name)).toEqual(["A"]);
  expect(shape).toHaveBeenCalledOnce();
  expect(shape).toHaveBeenCalledWith("A");
});
