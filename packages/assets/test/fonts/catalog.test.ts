import { expect, it } from "vitest";
import { FONT_CATALOG, MAX_FONT_FILE_BYTES } from "../../src/fonts/catalog";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
it("ships twenty unique local faces with matching pinned bytes and retained font licenses", async () => {
  const manifest = JSON.parse(await readFile("apps/web/public/fonts/manifest.json", "utf8")) as {
    fonts: { family: string; file: string; sha256: string; bytes: number; license: string }[];
  };
  expect(FONT_CATALOG).toHaveLength(20);
  expect(MAX_FONT_FILE_BYTES).toBe(33_554_432);
  expect(new Set(FONT_CATALOG.map((font) => font.family)).size).toBe(20);
  expect(new Set(FONT_CATALOG.map((font) => font.id)).size).toBe(20);
  for (const font of FONT_CATALOG) {
    const entry = manifest.fonts.find((entry) => entry.family === font.family)!;
    expect(entry.file).toBe(`${font.id}/font.ttf`);
    const bytes = await readFile(`apps/web/public/fonts/${entry.file}`);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
    expect(bytes.length).toBe(entry.bytes);
    expect(bytes.length).toBeLessThanOrEqual(MAX_FONT_FILE_BYTES);
    expect(await readFile(`apps/web/public/fonts/${entry.license}`, "utf8")).toContain(
      "SIL OPEN FONT LICENSE",
    );
  }
});
