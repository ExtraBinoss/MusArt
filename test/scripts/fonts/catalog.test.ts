import { expect, it } from "vitest";
import {
  buildFontRows,
  catalogChunks,
  parseGoogleJSON,
  variantWeight,
} from "../../../scripts/fonts/catalog";
it("converts pinned public metadata deterministically and retains fonts missing from the Git tree via official manifests", () => {
  const metadata = JSON.stringify({
    familyMetadataList: [
      { family: "Zed", category: "Serif" },
      { family: "Alpha", category: "Sans Serif" },
      { family: "Remote", category: "Handwriting" },
    ],
  });
  const tree = JSON.stringify({
    tree: [
      { path: "ofl/alpha/Alpha-Regular.ttf", type: "blob", size: 100 },
      { path: "ofl/alpha/Alpha-BoldItalic.ttf", type: "blob", size: 110 },
      { path: "ofl/alpha/OFL.txt", type: "blob" },
      { path: "apache/zed/static/Zed[wght].ttf", type: "blob", size: 120 },
      { path: "ufl/ignored/file.txt", type: "blob" },
    ],
  });
  const rows = buildFontRows(metadata, tree, {
    Remote: [
      { filename: "Remote-Regular.ttf", url: "https://fonts.gstatic.com/s/remote/file.ttf" },
    ],
  });
  expect(rows.map((row) => row[0])).toEqual(["Alpha", "Remote", "Zed"]);
  expect(rows[0]![2]).toContainEqual(["ofl/alpha/Alpha-BoldItalic.ttf", 700, true, 110]);
  expect(rows[0]![3]).toBe("ofl/alpha/OFL.txt");
  expect(rows[2]![3]).toContain("fonts.google.com/specimen/Zed");
  expect(
    buildFontRows(metadata, tree, {
      Remote: [
        { filename: "Remote-Regular.ttf", url: "https://fonts.gstatic.com/s/remote/file.ttf" },
      ],
    }),
  ).toEqual(rows);
  expect(() => buildFontRows(metadata, tree)).toThrow("No public outline");
  expect(() => buildFontRows(metadata, '{"truncated":true,"tree":[]}')).toThrow("Incomplete");
  expect(() => buildFontRows("{}", tree)).toThrow("Incomplete");
  expect(parseGoogleJSON(')]}\'\n{"ok":true}')).toEqual({ ok: true });
  expect(variantWeight("Face-ExtraLight.ttf")).toBe(200);
  expect(variantWeight("Face-Unknown.otf")).toBe(400);
});
it("splits data below the600-line rule without dropping or reordering records", () => {
  const rows = Array.from(
    { length: 100 },
    (_, index) =>
      [
        `Family${index}`,
        "sans",
        [[`ofl/${index}/font.ttf`, 400, false, 120]],
        "https://example.com/license",
      ] as Parameters<typeof catalogChunks>[0][number],
  );
  const chunks = catalogChunks(rows);
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.flat()).toEqual(rows);
  expect(chunks.every((chunk) => JSON.stringify(chunk, null, 2).split("\n").length <= 480)).toBe(
    true,
  );
  expect(catalogChunks([])).toEqual([]);
});
