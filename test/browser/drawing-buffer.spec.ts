import { expect, test } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject, type Asset } from "@musart/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { imageDifference } from "./support/photographic-effect";
import { installReadbackProbe } from "./support/readback-probe";
import { installWebGLFrameSnapshot, nativeWebGLFrame } from "./support/webgl-frame-snapshot";
import { zoomViewport } from "./support/viewport";
import { densityEnvironment } from "./support/effect-density";
import { inspectImage } from "./support/image-probe";

test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.25 });
for (const forceWebGL of [false, true])
  test(`fractional DPR preserves exact independent non-square frame dimensions (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    const backend = forceWebGL ? "webgl" : "webgpu",
      errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installReadbackProbe(page);
    if (forceWebGL) {
      await installWebGLFrameSnapshot(page);
      await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
    }
    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    const bytes = await readFile("apps/web/public/benchmark/50-waterfall-5.jpg");
    const asset: Asset = {
      id: "thin-photo",
      name: "Original photographic backing witness",
      mime: "image/jpeg",
      width: 1280,
      height: 960,
      dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
    };
    const project = createProject({
      assets: { [asset.id]: asset },
      pages: [
        createPage({
          width: 778,
          height: 17,
          background: "transparent",
          layers: [
            createLayer("image", {
              x: 0,
              y: 0,
              assetId: asset.id,
              width: 778,
              height: 17,
              effects: [
                createEffect("dither", { scale: 2, levels: 2, seed: 42 }),
                createEffect("halftone", { scale: 2, levels: 2, color: true }),
              ],
            }),
          ],
        }),
      ],
    });
    await page.evaluate((project) => window.musart!.load(project), project);
    const inspection = await page.context().newPage();
    await page.bringToFront();
    try {
      await page.getByTestId("artboard").hover();
      await zoomViewport(page, 0.16348);
      await page.waitForFunction((id) => {
        const d = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
        return (
          d?.projectId === id &&
          d.rendererReady === "true" &&
          d.sceneRevision === d.renderedRevision &&
          Number(d.renderWidth) === 159 &&
          Number(d.renderHeight) === 4
        );
      }, project.id);
      const canvas = page.locator(".editor-gpu-scene canvas");
      await expect(canvas).toHaveAttribute("data-backend", backend);
      const dimensions = await canvas.evaluate((element) => {
        const c = element as HTMLCanvasElement;
        return {
          intrinsic: [c.width, c.height],
          requested: [Number(c.dataset.renderWidth), Number(c.dataset.renderHeight)],
          style: { width: c.style.width, height: c.style.height },
          zoom: Number(c.closest<HTMLElement>('[data-testid="artboard"]')!.dataset.zoom),
        };
      });
      const live = forceWebGL
        ? (await nativeWebGLFrame(page, project.id)).dataUrl
        : await canvas.evaluate((c) => (c as HTMLCanvasElement).toDataURL("image/png"));
      const exported = await page.evaluate(
        (forceWebGL) => window.musart!.render({ format: "png", scale: 0.20435, forceWebGL }),
        forceWebGL,
      );
      const metrics = await imageDifference(inspection, exported, live);
      const witness = await inspectImage(
        page,
        exported,
        [{ x: 0, y: 0, width: 1, height: 1 }],
        inspection,
      );
      const environment = await densityEnvironment(page);
      await mkdir("artifacts/drawing-buffer", { recursive: true });
      for (const [name, source] of [
        ["native", live],
        ["export", exported],
      ])
        await writeFile(
          `artifacts/drawing-buffer/${backend}-${name}.png`,
          Buffer.from(source!.split(",")[1]!, "base64"),
        );
      await writeFile(
        `artifacts/drawing-buffer/${backend}.json`,
        JSON.stringify({ dimensions, metrics, witness, environment, errors }, null, 2),
      );
      expect(dimensions.intrinsic).toEqual([159, 4]);
      expect(dimensions.requested).toEqual(dimensions.intrinsic);
      expect(dimensions.style).toEqual({ width: "778px", height: "17px" });
      expect(dimensions.zoom).toBeCloseTo(0.16348, 5);
      expect(metrics.reference).toEqual([159, 4]);
      expect(metrics.candidate).toEqual(metrics.reference);
      expect(metrics.differentBytes).toBe(0);
      expect(witness.regions[0]!.colors).toBeGreaterThan(8);
      expect(witness.regions[0]!.opaque).toBe(1);
      expect(errors).toEqual([]);
      expect(environment.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
    } finally {
      if (forceWebGL)
        await page.evaluate(() => {
          window.__stopLiveWebGLSnapshot?.();
          delete window.__stopLiveWebGLSnapshot;
        });
      await inspection.close();
    }
  });
