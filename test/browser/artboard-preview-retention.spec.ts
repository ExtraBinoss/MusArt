import { expect, test, type Page } from "@playwright/test";
import { createEffect, createLayer, createProject } from "@musart/core";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/techno";
import { inspectImage } from "./support/image-probe";
import { installReadbackProbe } from "./support/readback-probe";
import { zoomViewport } from "./support/viewport";

declare global {
  interface Window {
    __artboardEncodingHold?: { calls: number; held: boolean; release?: () => void };
  }
}
async function presented(page: Page, id: string) {
  await page.waitForFunction((id) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return canvas?.dataset.pageId === id && canvas.dataset.rendererReady === "true";
  }, id);
}

test("inactive AFTERHOURS image-and-effect artboards retain real artwork through partial canonical refreshes", async ({
  page,
}) => {
  test.setTimeout(90000);
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      const hold = window.__artboardEncodingHold;
      if (!hold || Math.max(this.width, this.height) !== 768)
        return original.call(this, callback, type, quality);
      const at = ++hold.calls;
      original.call(
        this,
        (blob) => {
          if (at !== 2) callback(blob);
          else {
            hold.held = true;
            hold.release = () => {
              hold.release = undefined;
              callback(blob);
            };
          }
        },
        type,
        quality,
      );
    };
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const original = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#f84aff";
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = "#31e6d7";
    context.fillRect(0, 0, 32, 64);
    return canvas.toDataURL("image/png");
  });
  let next = 0;
  const first = createTechnoArtboard(() => `retention-first-${++next}`),
    second = createTechnoArtboard(() => `retention-second-${++next}`);
  first.id = "retention-first";
  second.id = "retention-second";
  for (const board of [first, second])
    board.layers.push(
      createLayer("image", {
        id: `${board.id}-image`,
        name: "Image with real FX",
        assetId: "retention-original",
        x: 150,
        y: 100,
        width: 778,
        height: 778,
        effects: [createEffect("dither", { amount: 1, levels: 3, color: true, scale: 3 })],
      }),
    );
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      name: "AFTERHOURS inactive previews",
      pages: [first, second],
      assets: {
        "retention-original": {
          id: "retention-original",
          name: "Original PNG",
          mime: "image/png",
          width: 64,
          height: 64,
          dataUrl: original,
        },
      },
    }),
  );
  await presented(page, first.id);
  await page.getByTestId("editor-canvas").hover();
  await zoomViewport(page, 0.2);
  await page.evaluate(async () => {
    await window.musart!.save();
    await window.musart!.flushThumbnails();
  });
  const firstImage = page.locator(
      `[data-artboard-id="${first.id}"].canvas-artboard-backdrop > img`,
    ),
    secondBoard = page.locator(`[data-artboard-id="${second.id}"].canvas-artboard-backdrop`),
    secondImage = secondBoard.locator(":scope > img");
  await expect(secondImage).toBeVisible();
  await expect
    .poll(() => secondImage.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const oldFirst = await firstImage.getAttribute("src"),
    oldSecond = await secondImage.getAttribute("src");
  for (const id of [second.id, first.id]) {
    await page.evaluate((id) => window.musart!.page(id), id);
    await presented(page, id);
  }
  const before = await inspectImage(page, await secondBoard.screenshot(), [
    { x: 0.15, y: 0.06, width: 0.65, height: 0.35 },
  ]);
  expect(before.colors).toBeGreaterThan(20);
  await page.evaluate(
    async ({ first, second }) => {
      window.__artboardEncodingHold = { calls: 0, held: false };
      window.musart!.page(second);
      window.musart!.execute({
        type: "updateLayers",
        ids: [`${second}-image`],
        patch: { opacity: 0.1 },
      });
      window.musart!.page(first);
      window.musart!.execute({
        type: "updateLayers",
        ids: [`${first}-image`],
        patch: { opacity: 0.2 },
      });
      await window.musart!.save();
    },
    { first: first.id, second: second.id },
  );
  try {
    await page.waitForFunction(() => window.__artboardEncodingHold?.held);
    await expect(firstImage).not.toHaveAttribute("src", oldFirst!);
    await expect(secondImage).toHaveAttribute("src", oldSecond!);
    await expect(secondImage).toBeVisible();
    const retained = await inspectImage(page, await secondBoard.screenshot(), [
      { x: 0.15, y: 0.06, width: 0.65, height: 0.35 },
    ]);
    expect(retained.colors).toBeGreaterThan(20);
    expect(retained.regions[0]!.hash).toBe(before.regions[0]!.hash);
  } finally {
    await page.evaluate(() => window.__artboardEncodingHold?.release?.());
  }
  await page.evaluate(() => window.musart!.flushThumbnails());
  await expect(secondImage).not.toHaveAttribute("src", oldSecond!);
  await expect
    .poll(() => secondImage.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const updated = await inspectImage(page, await secondBoard.screenshot(), [
    { x: 0.15, y: 0.06, width: 0.65, height: 0.35 },
  ]);
  expect(updated.colors).toBeGreaterThan(20);
  expect(updated.regions[0]!.hash).not.toBe(before.regions[0]!.hash);
  await page.screenshot({ path: "artifacts/screenshots/artboard-preview-retention.png" });
  const readbacks = await page.evaluate(() => window.__musartVideoReadbacks!);
  expect(readbacks).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    canvasHook: true,
  });
  expect(readbacks.gpuHook || readbacks.webglHook).toBe(true);
});
