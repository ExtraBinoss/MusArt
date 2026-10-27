import { it, expect } from "vitest";
import { SOCIAL_PRESETS, pageFromPreset, safeAreaGuides } from "../../src/layout/presets";
it("creates editable guides only for documented safe areas and preserves explicit overrides", () => {
  const banner = SOCIAL_PRESETS.find((item) => item.id === "youtube-banner")!;
  const page = pageFromPreset(banner);
  expect(page.guides.map((guide) => guide.position)).toEqual([507, 2053, 508.5, 931.5]);
  expect(new Set(page.guides.map((guide) => guide.id)).size).toBe(4);
  expect(page.margins).not.toBe(banner.safeArea);
  const plain = pageFromPreset(SOCIAL_PRESETS[0]!);
  expect(plain.guides).toEqual([]);
  expect(plain.margins).toBeUndefined();
  expect(
    pageFromPreset(banner, {
      name: "Custom",
      guides: [],
      margins: { top: 1, right: 2, bottom: 3, left: 4 },
    }),
  ).toMatchObject({ name: "Custom", guides: [], margins: { left: 4 } });
  expect(
    safeAreaGuides(10, 10, { top: 1, right: 2, bottom: 3, left: 4 }, "safe").map(
      (guide) => guide.id,
    ),
  ).toEqual(["safe-left", "safe-right", "safe-top", "safe-bottom"]);
  expect(() => safeAreaGuides(0, 10, { top: 0, right: 0, bottom: 0, left: 0 })).toThrow();
  expect(() => pageFromPreset({ ...banner, width: 0 })).toThrow();
});
