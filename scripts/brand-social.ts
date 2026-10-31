import { chromium, type Browser } from "@playwright/test";
import { resolve } from "node:path";

/** Screenshots the actual React/Three/TSL artboard after its native frame acknowledgement. */
export async function captureBrandSocialImage(
  options: {
    url?: string;
    output?: string;
    launch?: () => Promise<Browser>;
  } = {},
): Promise<void> {
  const browser = await (options.launch?.() ??
    chromium.launch({
      args: [
        "--no-sandbox",
        "--enable-unsafe-webgpu",
        "--enable-unsafe-swiftshader",
        "--use-angle=vulkan",
        "--enable-features=Vulkan",
      ],
    }));
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 750 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    await page.goto(
      new URL("ssr", `${(options.url ?? "http://localhost:6100").replace(/\/$/, "")}/`).href,
    );
    await page.locator('[data-brand-art-status="ready"]').waitFor({ timeout: 30000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode()));
    });
    const card = page.locator("[data-social-image]");
    const box = await card.boundingBox();
    if (!box || box.width !== 1200 || box.height !== 630)
      throw Error("The social artboard must measure exactly 1200 × 630.");
    await card.screenshot({
      path: options.output ?? resolve("apps/web/public/branding/melt-social.png"),
      animations: "disabled",
    });
  } finally {
    await browser.close();
  }
}
if (import.meta.main) await captureBrandSocialImage({ url: process.argv[2] });
