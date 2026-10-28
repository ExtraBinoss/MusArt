import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as opentype from "opentype.js";
import { outlineFont } from "../../../../../packages/render/test/text-fixture";
import { readFile } from "node:fs/promises";
import { MAX_FONT_FILE_BYTES } from "@musart/assets";
import {
  FontLibraryError,
  fontWeight,
  normalizeFamily,
  validateFontBytes,
} from "../../../src/services/fonts/validation";
import { bytes, cleanup, platform } from "./fixtures";
vi.mock("opentype.js", async (original) => {
  const actual = await original<typeof import("opentype.js")>();
  const api = (actual as typeof actual & { default?: typeof actual }).default ?? actual;
  return { ...actual, ...api, parse: vi.fn(api.parse) };
});
beforeEach(platform);
afterEach(cleanup);
it("validates real OpenType/TrueType outlines, native SHA256 and canonical metadata", async () => {
  const buffer = bytes(),
    result = await validateFontBytes(buffer, "Fallback");
  expect(result).toMatchObject({
    label: expect.stringContaining("Test"),
    category: "sans",
    weight: 500,
    format: "otf",
  });
  expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect((await validateFontBytes(buffer.slice(0), "Other name")).sha256).toBe(result.sha256);
  const actual = await readFile("apps/web/public/fonts/inter/font.ttf");
  expect((await validateFontBytes(new Uint8Array(actual).buffer, "Inter")).format).toBe("ttf");
  expect(normalizeFamily('  "Custom:ABC" ')).toBe("custom:abc");
});
it("classifies native metadata and rejects invalid metrics before persistence", async () => {
  const parse = vi.mocked(opentype.parse),
    font = outlineFont();
  font.unitsPerEm = 0;
  parse.mockReturnValueOnce(font);
  await expect(validateFontBytes(bytes(), "x")).rejects.toMatchObject({ code: "invalid" });
  font.unitsPerEm = 1000;
  Object.assign(font.tables, { post: { isFixedPitch: 1 } });
  parse.mockReturnValueOnce(font);
  expect((await validateFontBytes(bytes(), "x")).category).toBe("mono");
  Object.assign(font.tables, { post: {}, os2: { sFamilyClass: 1 << 8, usWeightClass: 400 } });
  parse.mockReturnValueOnce(font);
  expect((await validateFontBytes(bytes(), "x")).category).toBe("serif");
  Object.assign(font.tables, { os2: { sFamilyClass: 10 << 8, usWeightClass: 400 } });
  parse.mockReturnValueOnce(font);
  expect((await validateFontBytes(bytes(), "x")).category).toBe("handwriting");
  vi.spyOn(font, "getEnglishName").mockReturnValue("");
  parse.mockReturnValueOnce(font);
  expect((await validateFontBytes(bytes(), "\u0000My local font\u0000")).label).toBe(
    "My local font",
  );
  parse.mockReturnValueOnce(font);
  expect((await validateFontBytes(bytes(), "\u0000")).label).toBe("Imported font");
});
it("rejects unsupported signatures, corrupt fonts, oversized files and invalid weights", async () => {
  await expect(validateFontBytes(new ArrayBuffer(8), "x")).rejects.toMatchObject({
    code: "unsupported",
  });
  const corrupt = new ArrayBuffer(12);
  new DataView(corrupt).setUint32(0, 0x00010000);
  await expect(validateFontBytes(corrupt, "x")).rejects.toMatchObject({ code: "invalid" });
  await expect(
    validateFontBytes(new ArrayBuffer(MAX_FONT_FILE_BYTES + 1), "x"),
  ).rejects.toMatchObject({ code: "tooLarge" });
  for (const weight of [NaN, 0, -1, 1001, 400.5])
    expect(() => fontWeight(weight)).toThrow(FontLibraryError);
  expect(fontWeight(1000)).toBe(1000);
});
