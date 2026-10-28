import { expect, test, type Locator, type Page } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { inspectImage } from "./support/image-probe";

declare global {
  interface Window {
    __layerPreviewRevoked?: string[];
  }
}
async function encoded(page: Page, image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const url = (await image.getAttribute("src"))!;
  const data = await page.evaluate(async (url) => {
    const blob = await fetch(url).then((response) => response.blob());
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new TypeError("Expected an encoded image URL."));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }, url);
  return { url, data };
}
test("inactive second-artboard image, dither and mask cards contain genuine decoded GPU previews", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    window.__layerPreviewRevoked = [];
    const original = URL.revokeObjectURL;
    URL.revokeObjectURL = (url) => {
      window.__layerPreviewRevoked!.push(url);
      original(url);
    };
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  // Native source preparation is allowed; no production pixels are read back into JavaScript.
  const originals = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 64, 64);
    gradient.addColorStop(0, "#00d4e5");
    gradient.addColorStop(1, "#f0389e");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    const image = canvas.toDataURL("image/png");
    context.fillStyle = "#000000";
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 32, 64);
    return { image, mask: canvas.toDataURL("image/png") };
  });
  const first = createPage({
    id: "first",
    name: "First",
    width: 128,
    height: 128,
    layers: [createLayer("rectangle", { id: "first-shape", x: 0, y: 0, width: 64, height: 64 })],
  });
  const dither = createEffect("dither", {
    id: "second-dither",
    amount: 1,
    scale: 2,
    levels: 2,
    color: false,
  });
  const owner = createLayer("image", {
    id: "second-image",
    name: "Second image",
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    assetId: "original",
    effects: [dither, createEffect("brightness", { id: "second-brightness", amount: 0.8 })],
    mask: { assetId: "matte", mode: "luminance", enabled: true, inverted: false },
  });
  const second = createPage({
    id: "second",
    name: "Second",
    width: 128,
    height: 128,
    layers: [owner],
  });
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      name: "Scoped layer previews",
      pages: [first, second],
      assets: {
        original: {
          id: "original",
          name: "Gradient",
          width: 64,
          height: 64,
          mime: "image/png",
          dataUrl: originals.image,
        },
        matte: {
          id: "matte",
          name: "Half mask",
          width: 64,
          height: 64,
          mime: "image/png",
          dataUrl: originals.mask,
        },
      },
    }),
  );
  const row = page.locator('.layer-row[data-layer-id="second-image"]');
  await expect(row).toBeVisible();
  const main = await encoded(page, row.locator('[data-thumbnail-variant="layer"] img'));
  const effect = await encoded(
    page,
    row.locator('[data-thumbnail-variant="effect"][data-thumbnail-effect-id="second-dither"] img'),
  );
  const mask = await encoded(page, row.locator('[data-thumbnail-variant="mask"] img'));
  expect(new Set([main.url, effect.url, mask.url]).size).toBe(3);
  expect(await page.evaluate(() => window.musart!.snapshot().pageId)).toBe(first.id);
  const regions = [
    { x: 0.1, y: 0.2, width: 0.25, height: 0.6 },
    { x: 0.65, y: 0.2, width: 0.25, height: 0.6 },
  ];
  const mainPixels = await inspectImage(page, main.data, regions);
  const effectPixels = await inspectImage(page, effect.data, regions);
  const maskPixels = await inspectImage(page, mask.data, regions);
  expect(mainPixels.width).toBe(96);
  expect(mainPixels.height).toBe(96);
  expect(mainPixels.regions[0]!.opaque).toBe(1);
  expect(mainPixels.regions[1]!.opaque).toBe(0);
  expect(effectPixels.regions[0]!.hash).not.toBe(mainPixels.regions[0]!.hash);
  expect(maskPixels.regions.every((region) => region.opaque === 1 && region.colors === 1)).toBe(
    true,
  );
  expect(maskPixels.regions[0]!.hash).not.toBe(maskPixels.regions[1]!.hash);
  await page.bringToFront();
  await mkdir("artifacts/screenshots", { recursive: true });
  await page.screenshot({ path: "artifacts/screenshots/second-artboard-layer-thumbnails.png" });
  // Deleting that still-inactive artboard releases its real URLs; no foreign-page result can survive.
  await page.evaluate(() => window.musart!.execute({ type: "deletePage", id: "second" }));
  await expect(row).toHaveCount(0);
  for (const preview of [main, effect, mask])
    await expect
      .poll(() => page.evaluate((url) => window.__layerPreviewRevoked!.includes(url), preview.url))
      .toBe(true);
  expect(await page.evaluate(() => window.musart!.snapshot().pageId)).toBe(first.id);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  expect(errors).toEqual([]);
  await writeFile(
    "artifacts/second-artboard-layer-thumbnails.json",
    JSON.stringify(
      { main: mainPixels, effect: effectPixels, mask: maskPixels, reads, errors },
      null,
      2,
    ),
  );
});
