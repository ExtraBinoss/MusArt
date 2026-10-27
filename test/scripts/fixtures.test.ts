import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import manifest from "../../apps/web/public/benchmark/manifest.json";
it("locks all 50 local image assets and their provenance to checked-in bytes", () => {
  expect(manifest.images).toHaveLength(50);
  expect(manifest.photos).toHaveLength(10);
  const files = new Set<string>();
  for (const image of manifest.images) {
    expect(files.has(image.file)).toBe(false);
    files.add(image.file);
    const data = readFileSync(resolve("apps/web/public/benchmark", image.file));
    expect(data.byteLength).toBe(image.bytes);
    expect(data[0]).toBe(255);
    expect(data[1]).toBe(216);
    expect(createHash("sha256").update(data).digest("hex")).toBe(image.sha256);
    expect([image.width, image.height]).toEqual([1280, 960]);
    expect(manifest.photos[image.photo]!.source).toMatch(
      /^https:\/\/images\.unsplash\.com\/photo-/,
    );
  }
  expect(manifest.license).toBe("https://unsplash.com/license");
});
