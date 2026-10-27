import { it, expect } from "vitest";
import { SOCIAL_PRESETS } from "../../src/layout/preset-catalog";
it("describes explicit social dimensions and truthful central YouTube banner safe area", () => {
  const sizes = Object.fromEntries(
    SOCIAL_PRESETS.map((item) => [item.id, [item.width, item.height]]),
  );
  expect(sizes).toEqual({
    "instagram-post": [1080, 1080],
    "instagram-portrait": [1080, 1350],
    "instagram-story": [1080, 1920],
    "instagram-reels": [1080, 1920],
    "tiktok-video": [1080, 1920],
    "youtube-thumbnail": [1280, 720],
    "youtube-banner": [2560, 1440],
    "linkedin-post": [1200, 627],
  });
  const banner = SOCIAL_PRESETS.find((item) => item.id === "youtube-banner")!;
  expect(banner.width - banner.safeArea!.left - banner.safeArea!.right).toBe(1546);
  expect(banner.height - banner.safeArea!.top - banner.safeArea!.bottom).toBe(423);
  expect(Object.isFrozen(banner.safeArea)).toBe(true);
  expect(new Set(SOCIAL_PRESETS.map((item) => item.id)).size).toBe(SOCIAL_PRESETS.length);
});
