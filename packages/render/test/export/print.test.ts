import { expect, test } from "vitest";
import { createLayer, createPage } from "@musart/core";
import { DEFAULT_PRINT, printComposition } from "../../src/export/print/layout";
import { printGeometry } from "../../src/export/print/geometry";
import { createPrintPdf } from "../../src/export/print/pdf";
import { createPrintPreview } from "../../src/export/print/preview-svg";
import { selectionFrameScope } from "../../src/export/motion/selection";

test("bleed retains artwork beyond the trim without scaling, moving nested children or modifying the source", () => {
  const root = createLayer("group", { id: "root", x: -10, y: 5 }),
    child = createLayer("rectangle", { parentId: root.id, x: 12 });
  const page = createPage({ width: 300, height: 200, layers: [root, child] });
  const printable = printComposition(page, { ...DEFAULT_PRINT, bleedMm: 3 });
  expect(printable).toMatchObject({ width: 372, height: 272 });
  expect(printable.layers[0]).toMatchObject({ x: 26, y: 41 });
  expect(printable.layers[1]).toBe(child);
  expect(root.x).toBe(-10);
  expect(() => printComposition(page, { ...DEFAULT_PRINT, dpi: NaN })).toThrow();
  expect(() => printComposition(page, { ...DEFAULT_PRINT, bleedMm: -1 })).toThrow();
});
test("PDF and preview share print boxes and marks; ICC data, four CMYK channels and Unicode document name are preserved", async () => {
  const page = {
    width: 372,
    height: 272,
    trimWidth: 300,
    trimHeight: 200,
    name: "Création (1)",
    options: {
      format: "pdf" as const,
      colorMode: "cmyk" as const,
      quality: 1,
      print: {
        ...DEFAULT_PRINT,
        bleedMm: 3,
        cropMarks: true,
        registrationMarks: true,
        colorBars: true,
        pageInfo: true,
      },
    },
  };
  const geometry = printGeometry(page);
  expect(geometry.lines).toHaveLength(8);
  expect(geometry.registration).toHaveLength(2);
  expect(geometry.bars).toHaveLength(7);
  expect(geometry.trim[2] - geometry.trim[0]).toBeCloseTo(72);
  const pdf = createPrintPdf(new Uint8Array([255, 216, 255, 217]), new Uint8Array([1, 2, 3]), page);
  const source = await pdf.text();
  expect(source).toContain("/N 4 /Alternate /DeviceCMYK");
  expect(source).toContain("/ColorSpace [/ICCBased 6 0 R]");
  expect(source).toContain("/Decode [1 0 1 0 1 0 1 0]");
  expect(source).toContain("/TrimBox [36.64 36.64 108.64 84.64]");
  expect(source).toContain("/OutputIntents [8 0 R]");
  expect(source).toContain("/Title <FEFF");
  expect(source).toContain("Cr\\351ation \\(1\\)");
  const svg = await createPrintPreview(new Uint8Array([1, 2]), page).text();
  expect(svg).toContain(`viewBox="0 0 ${geometry.totalW} ${geometry.totalH}"`);
  expect(svg).toContain("Création (1)");
  expect(svg).toContain("CGATS21 CRPC6");
  const xref = source.slice(source.indexOf("xref"));
  expect(xref).toContain("0 11");
});
test("selected animation/replay frames retain a fixed crop and omit unrelated content, including missing early history", () => {
  const layer = createLayer("rectangle", { id: "selected", x: 40, y: 20, width: 30, height: 15 });
  const page = createPage({ layers: [layer, createLayer("rectangle", { id: "other" })] });
  const scope = selectionFrameScope(page, [layer.id]);
  const moved = scope.frame({ ...page, layers: [{ ...layer, x: 50 }, page.layers[1]!] });
  expect(moved).toMatchObject({ width: 30, height: 15, background: "transparent" });
  expect(moved.layers).toHaveLength(1);
  expect(moved.layers[0]).toMatchObject({ x: 10, y: 0 });
  expect(scope.frame({ ...page, layers: [] }).layers).toEqual([]);
  expect(selectionFrameScope(page).frame(page)).toBe(page);
});
