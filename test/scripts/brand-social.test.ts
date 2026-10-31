import { expect, test, vi } from "vitest";
import type { Browser } from "@playwright/test";
import { captureBrandSocialImage } from "../../scripts/brand-social";
function fixture() {
  const screenshot = vi.fn(),
    waitFor = vi.fn(),
    boundingBox = vi.fn(async () => ({ width: 1200, height: 630 }));
  const page = {
    goto: vi.fn(),
    evaluate: vi.fn(),
    locator: vi.fn(() => ({ screenshot, waitFor, boundingBox })),
  };
  const close = vi.fn(),
    newPage = vi.fn(async () => page);
  return {
    close,
    screenshot,
    waitFor,
    page,
    boundingBox,
    launch: vi.fn(async () => ({ newPage, close }) as unknown as Browser),
  };
}
test("capture waits for native artwork and closes its browser after output", async () => {
  const f = fixture();
  await captureBrandSocialImage({
    launch: f.launch,
    url: "http://localhost:6100/MusArt/",
    output: "artifacts/social.png",
  });
  expect(f.page.goto).toHaveBeenCalledWith("http://localhost:6100/MusArt/ssr");
  expect(f.waitFor).toHaveBeenCalledWith({ timeout: 30000 });
  expect(f.screenshot).toHaveBeenCalledWith({
    path: "artifacts/social.png",
    animations: "disabled",
  });
  expect(f.close).toHaveBeenCalledOnce();
});
test("a failed or incorrectly sized render cannot produce a successful asset", async () => {
  const f = fixture();
  f.boundingBox.mockResolvedValue({ width: 800, height: 420 });
  await expect(captureBrandSocialImage({ launch: f.launch })).rejects.toThrow("1200 × 630");
  expect(f.screenshot).not.toHaveBeenCalled();
  expect(f.close).toHaveBeenCalledOnce();
});
