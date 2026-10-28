import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { inspectImage } from "./support/image-probe";
import { installReadbackProbe } from "./support/readback-probe";

async function presented(page: Page, after = -1) {
  await page.waitForFunction((after) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas");
    return (
      canvas?.dataset.rendererReady === "true" &&
      canvas.dataset.renderedRevision === canvas.dataset.sceneRevision &&
      Number(canvas.dataset.renderCount) > after
    );
  }, after);
}

async function state(page: Page) {
  return page.evaluate(() => {
    const snapshot = window.musart!.snapshot(),
      canvas = document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")!,
      stats = JSON.parse(canvas.dataset.gpuStats!) as { uploads: number; targets: number };
    const counts = Object.fromEntries(
      [".musart-app", ".canvas-area", ".editor-canvas", ".editor-gpu-scene", ".inspector"].map(
        (selector) => {
          const raw = document.querySelector<HTMLElement>(selector)?.dataset.reactRenders;
          if (!raw || Number(raw) < 1) throw new Error(`Missing React counter for ${selector}`);
          return [selector, Number(raw)];
        },
      ),
    );
    return {
      counts,
      stats,
      rendered: Number(canvas.dataset.renderCount),
      instances: Number(canvas.dataset.rendererInstances),
      revision: snapshot.revision,
      canUndo: snapshot.canUndo,
      canRedo: snapshot.canRedo,
      angle: snapshot.project.pages[0]!.layers[0]!.fillGradient!.angle,
    };
  });
}

test("gradient angle scrubbing changes vector text pixels without editor React commits or readbacks", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const document = createProject({
    id: "gradient-gesture-project",
    pages: [
      createPage({
        width: 640,
        height: 400,
        background: "#ffffff",
        layers: [
          createLayer("text", {
            id: "gradient-text",
            x: 40,
            y: 110,
            width: 560,
            height: 150,
            text: "MusArt",
            fontFamily: "Inter",
            fontSize: 96,
            fill: "#000000",
            fillGradient: {
              kind: "linear",
              angle: 0,
              stops: [
                { offset: 0, color: "#ff2233" },
                { offset: 1, color: "#2266ff" },
              ],
            },
          }),
        ],
      }),
    ],
  });
  await page.evaluate((document) => {
    window.musart!.load(document);
    window.musart!.select(["gradient-text"]);
  }, document);
  await page.getByRole("button", { name: "100 % · Recentrer", exact: true }).click();
  await presented(page);
  await page.evaluate(() => window.musart!.flushThumbnails());
  const probe = await page.context().newPage();
  await page.bringToFront();
  async function hash() {
    const image = await inspectImage(
      page,
      await page.locator(".canvas-artboard canvas").screenshot(),
      [{ x: 0.05, y: 0.25, width: 0.9, height: 0.45 }],
      probe,
    );
    return image.regions[0]!.hash;
  }
  try {
    const handle = page.getByRole("button", { name: "Ajuster Angle du dégradé", exact: true });
    await handle.scrollIntoViewIfNeeded();
    await handle.focus();
    const box = (await handle.boundingBox())!,
      start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const baseline = await state(page),
      beforeHash = await hash();
    expect(baseline.canUndo).toBe(false);
    const hashes: number[] = [];
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (const offset of [-100, -200]) {
      const prior = await state(page);
      await page.mouse.move(start.x + offset, start.y, { steps: 6 });
      await presented(page, prior.rendered);
      const current = await state(page);
      expect(current.counts).toEqual(baseline.counts);
      expect(current.instances).toBe(baseline.instances);
      expect(current.stats.uploads).toBe(baseline.stats.uploads);
      expect(current.stats.targets).toBe(baseline.stats.targets);
      expect(current.angle).toBe(0);
      expect(current.revision).toBe(baseline.revision);
      hashes.push(await hash());
    }
    expect(new Set([beforeHash, ...hashes]).size).toBe(3);
    await page.mouse.up();
    await expect.poll(async () => (await state(page)).revision).toBe(baseline.revision + 1);
    await presented(page);
    const committed = await state(page);
    expect(committed.angle).toBe(-40);
    expect(await hash()).toBe(hashes.at(-1));
    await page.evaluate(() => window.musart!.undo());
    await presented(page);
    expect((await state(page)).canUndo).toBe(false);
    expect((await state(page)).angle).toBe(0);
    expect(await hash()).toBe(beforeHash);
    await page.evaluate(() => window.musart!.redo());
    await presented(page);
    expect(await hash()).toBe(hashes.at(-1));
    const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
    expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, canvasHook: true });
    expect(reads.gpuHook || reads.webglHook).toBe(true);
    await testInfo.attach("gradient-live-preview", {
      body: JSON.stringify({ baseline, committed, beforeHash, hashes, reads }, null, 2),
      contentType: "application/json",
    });
  } finally {
    await page.mouse.up();
    await probe.close();
  }
});
