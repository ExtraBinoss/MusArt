import { expect, test, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  renderBrandSvg,
  writeBrandAssets,
  writeRasterBrandAssets,
} from "../../scripts/brand-assets";
import { createDahliaEngine } from "../../apps/web/src/ui/brand/dahlia";
test("exports the exact genuine engine frame as SVG and an inset maskable icon", () => {
  const frame = createDahliaEngine().sample(0.75),
    svg = renderBrandSvg();
  expect(svg).toContain(`d="${frame.bodyPath}"`);
  for (const eye of frame.eyes) {
    expect(svg).toContain(`d="${eye.d}"`);
    expect(svg).toContain(`transform="${eye.matrix}"`);
  }
  expect(svg).toContain('aria-label="Melt"');
  expect(svg).toContain('fill="url(#melt-tint)"');
  expect(svg).toContain('stop-color="#8B5CF6"');
  expect(renderBrandSvg(true)).toContain("translate(256 256) scale(1.7)");
});
test("public install icons are exact copies of the canonical source SVGs and match their checksum manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "melt-brand-"));
  try {
    await writeBrandAssets(root);
    const manifest = JSON.parse(
      await readFile(join(root, "apps/web/src/ui/brand/assets/manifest.json"), "utf8"),
    ) as { files: Record<string, string> };
    for (const [name, checksum] of Object.entries(manifest.files)) {
      const source = await readFile(join(root, "apps/web/src/ui/brand/assets", name));
      expect(await readFile(join(root, "apps/web/public/branding", name))).toEqual(source);
      expect(createHash("sha256").update(source).digest("hex")).toBe(checksum);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed native icon encoding closes the browser and reports the actual error", async () => {
  const root = await mkdtemp(join(tmpdir(), "melt-native-brand-"));
  const close = vi.fn().mockResolvedValue(undefined);
  vi.doMock("@playwright/test", () => ({
    chromium: {
      launch: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          evaluate: vi.fn().mockRejectedValue(new Error("Native SVG decode failed")),
        }),
        close,
      }),
    },
  }));
  try {
    await expect(writeRasterBrandAssets(root)).rejects.toThrow("Native SVG decode failed");
    expect(close).toHaveBeenCalledOnce();
  } finally {
    vi.doUnmock("@playwright/test");
    await rm(root, { recursive: true, force: true });
  }
});
