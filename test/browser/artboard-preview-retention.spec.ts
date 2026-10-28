import { expect, test, type Page } from "@playwright/test";
import { createEffect, createLayer, createProject } from "@musart/core";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/techno";
import { inspectImage } from "./support/image-probe";
import { installReadbackProbe } from "./support/readback-probe";
import { zoomViewport } from "./support/viewport";

declare global {
  interface Window {
    __artboardEncodingHold?: { calls: number; held: boolean; release?: () => void };
    __firstSwitchBlocked?: boolean;
    __firstSwitchSnapshots?: number;
    __firstSwitchCallbacks?: (() => void)[];
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

test("the first real composition switch after reload retains historical artwork and recovers an orphan modifier without prewarming the new revision", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#777777";
    context.beginPath();
    context.roundRect(0, 0, 96, 96, 18);
    context.fill();
    context.fillStyle = "#ffffff";
    for (let at = 0; at < 8; at++) {
      const angle = (at * Math.PI) / 4;
      context.beginPath();
      context.arc(48 + Math.cos(angle) * 20, 48 + Math.sin(angle) * 20, 12, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = "#777777";
    context.beginPath();
    context.arc(48, 48, 12, 0, Math.PI * 2);
    context.fill();
    return canvas.toDataURL("image/png");
  });
  let next = 0;
  const first = createTechnoArtboard(() => `first-switch-a-${++next}`),
    second = createProject().pages[0]!;
  first.id = "first-switch-a";
  second.id = "first-switch-b";
  second.name = "Composition 2";
  second.width = 1080;
  second.height = 1920;
  second.background = "#000000";
  const image = createLayer("image", {
    id: "first-switch-image",
    name: "Beam-like original",
    assetId: "first-switch-original",
    x: 151,
    y: 0,
    width: 778,
    height: 778,
    effects: [
      createEffect("dither", { amount: 1, scale: 1, levels: 2, color: false }),
      createEffect("halftone", { amount: 1, scale: 1, color: true }),
    ],
  });
  second.layers = [image];
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      name: "Historical first switch",
      pages: [first, second],
      assets: {
        "first-switch-original": {
          id: "first-switch-original",
          name: "Original PNG",
          mime: "image/png",
          width: 96,
          height: 96,
          dataUrl,
        },
      },
    }),
  );
  // Build the historical fixture with real GPU pixels. The subsequently loaded
  // runtime below never prewarms the NEW Dither16 revision before its first switch.
  await page.evaluate(async () => {
    await window.musart!.save();
    await window.musart!.flushThumbnails();
  });
  await page.evaluate(
    async ({ pageId, id, effect }) => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Alt", code: "AltLeft", altKey: true }),
      );
      window.musart!.page(pageId);
      window.musart!.execute({
        type: "updateLayers",
        ids: [id],
        patch: { effects: [{ ...effect, scale: 16 }] },
      });
      await window.musart!.save();
    },
    { pageId: second.id, id: image.id, effect: image.effects[0]! },
  );
  await page.close();
  const consumer = await page.context().newPage();
  try {
    await installReadbackProbe(consumer);
    await consumer.addInitScript(() => {
      window.__firstSwitchBlocked = true;
      window.__firstSwitchSnapshots = 0;
      window.__firstSwitchCallbacks = [];
      const original = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        if (Math.max(this.width, this.height) !== 768)
          return original.call(this, callback, type, quality);
        window.__firstSwitchSnapshots!++;
        return original.call(
          this,
          (blob) => {
            if (window.__firstSwitchBlocked)
              window.__firstSwitchCallbacks!.push(() => callback(blob));
            else callback(blob);
          },
          type,
          quality,
        );
      };
    });
    await consumer.goto("/?automation=1");
    await consumer.waitForFunction(() => Boolean(window.musart));
    await consumer.keyboard.down("Alt");
    await presented(consumer, first.id);
    const board = consumer.locator(`.canvas-artboard-backdrop[data-artboard-id="${second.id}"]`),
      preview = board.locator(":scope > img"),
      headingA = consumer.locator(
        `.artboard-heading[data-artboard-id="${first.id}"] .artboard-name`,
      ),
      headingB = consumer.locator(
        `.artboard-heading[data-artboard-id="${second.id}"] .artboard-name`,
      );
    await expect(preview).toBeVisible();
    await expect
      .poll(() => preview.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await expect(board).toHaveAttribute("data-preview-current", "false");
    await expect(board).toHaveAttribute("aria-busy", "true");
    const old = await preview.getAttribute("src"),
      box = (await headingB.boundingBox())!;
    await consumer.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await consumer.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await consumer.evaluate(() => window.__firstSwitchSnapshots)).toBe(0);
    // A genuinely held Alt remains blocked despite real pointer movement with altKey=true.
    await consumer.keyboard.up("Alt");
    // Model the observed browser-toolbar fault: a keydown was delivered but its
    // keyup was consumed outside the page. Recovery must come from REAL clicks.
    await consumer.evaluate(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Alt", code: "AltLeft", altKey: true }),
      ),
    );
    const before = await consumer.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
    await headingB.click();
    await presented(consumer, second.id);
    await headingA.click();
    await presented(consumer, first.id);
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute("src", old!);
    await expect(board).toHaveAttribute("data-preview-current", "false");
    const pixels = await inspectImage(consumer, await board.screenshot(), [
      { x: 0.1, y: 0.01, width: 0.8, height: 0.4 },
    ]);
    expect(pixels.regions[0]!.colors).toBeGreaterThan(1);
    await consumer.waitForFunction(() => Boolean(window.__firstSwitchCallbacks?.length));
    await consumer.evaluate(() => {
      window.__firstSwitchBlocked = false;
      for (const release of window.__firstSwitchCallbacks!.splice(0)) release();
    });
    await consumer.evaluate(() => window.musart!.flushThumbnails());
    await expect(board).toHaveAttribute("data-preview-current", "true");
    await expect(preview).not.toHaveAttribute("src", old!);
    await expect
      .poll(() => preview.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    expect(await consumer.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
      before,
    );
    const reads = await consumer.evaluate(() => window.__musartVideoReadbacks!);
    expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, canvasHook: true });
    await consumer.screenshot({
      path: "artifacts/screenshots/artboard-first-switch-recovered.png",
    });
  } finally {
    await consumer.close();
  }
});
