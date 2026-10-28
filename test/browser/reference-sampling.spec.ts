import { expect, test, type Page } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { DENSITY_CASES, compareDensity, densityProject, densityEnvironment } from "./support/effect-density";
import { installReadbackProbe } from "./support/readback-probe";
import { installWebGLFrameSnapshot, nativeWebGLFrame } from "./support/webgl-frame-snapshot";
import { zoomViewport } from "./support/viewport";
async function ready(page: Page, projectId: string, zoom?: number) {
  await page.waitForFunction(({ projectId, zoom }) => {
    const d = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return d?.projectId === projectId && d.rendererReady === "true" && d.sceneRevision === d.renderedRevision && (zoom === undefined || Number(d.renderWidth) === 112 * zoom);
  }, { projectId, zoom });
}
const png = (page: Page, scale: number, forceWebGL: boolean) => page.evaluate(options => window.musart!.render(options), { scale, forceWebGL, format: "png" as const });
for (const forceWebGL of [false, true])
  test(`fractional transparent Grain has exact full RGBA in live canvas and same-density export (${forceWebGL ? "WebGL fallback" : "WebGPU"})`, async ({ page }) => {
    test.setTimeout(60000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await installReadbackProbe(page);
    if (forceWebGL) {
      await installWebGLFrameSnapshot(page);
      await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
    }
    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    const inspection = await page.context().newPage();
    await page.bringToFront();
    const fixture = DENSITY_CASES.find(fixture => fixture.name === "fractional-grain")!;
    const project = densityProject(fixture);
    await page.evaluate(project => window.musart!.load(project), project);
    const rows: { zoom: number; metrics: Awaited<ReturnType<typeof compareDensity>> }[] = [];
    try {
      await ready(page, project.id);
      expect(await page.locator(".editor-gpu-scene canvas").getAttribute("data-backend"))
        .toBe(forceWebGL ? "webgl" : "webgpu");
      for (const zoom of [1, 2, 4]) {
        await page.getByTestId("artboard").hover();
        await zoomViewport(page, zoom);
        await ready(page, project.id, zoom);
        const native = forceWebGL ? (await nativeWebGLFrame(page, project.id)).dataUrl
          : await page.locator(".editor-gpu-scene canvas").evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL("image/png"));
        const exported = await png(page, zoom, forceWebGL);
        const metrics = await compareDensity(inspection, exported, native);
        expect(metrics.reference).toEqual([112 * zoom, 80 * zoom]);
        expect(metrics.candidate).toEqual(metrics.reference);
        rows.push({ zoom, metrics });
      }
      const info = await densityEnvironment(page);
      await mkdir("artifacts", { recursive: true });
      await writeFile(`artifacts/fractional-live-${forceWebGL ? "webgl" : "webgpu"}.json`, JSON.stringify({
        boundary: "Transparent fractional geometry, every decoded RGBA byte in the entire real editor canvas versus same-density native PNG. WebGL encoding runs synchronously immediately after the default-framebuffer draw, before browser presentation clears it. No preserveDrawingBuffer or JS pixel readbacks in production.", rows, errors, environment: info,
      }, null, 2));
      for (const { metrics } of rows) {
        expect(metrics.differentPixels).toBe(0);
        expect(metrics.maximumByteDifference).toBe(0);
      }
      expect(errors).toEqual([]);
      expect({ gpu: info.reads.gpu, webgl: info.reads.webgl, canvas: info.reads.canvas }).toEqual({ gpu: 0, webgl: 0, canvas: 0 });
    } finally {
      if (forceWebGL) await page.evaluate(() => { window.__stopLiveWebGLSnapshot?.(); delete window.__stopLiveWebGLSnapshot; });
      await inspection.close();
    }
  });

for (const forceWebGL of [false, true])
  test(`near-integer reference resize keeps high-contrast Dither stable at 95.999→96 and 2× (${forceWebGL ? "WebGL fallback" : "WebGPU"})`, async ({ page }) => {
    await installReadbackProbe(page);
    if (forceWebGL) await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    const inspection = await page.context().newPage();
    await page.bringToFront();
    const outputs: string[] = [];
    try {
      for (const width of [95.999, 96]) {
        const group = createLayer("group", { id: "near-owner", x: 8, y: 8, width, height: 64,
          effects: [createEffect("dither", { amount: 1, scale: 1, levels: 2, color: false, seed: 42 })] });
        const flat = createLayer("rectangle", { id: "near-flat", parentId: group.id, x: 0, y: 0, width, height: 64, fill: "#808080" });
        const project = createProject({ pages: [createPage({ id: "density-page", width: 112, height: 80, layers: [group, flat], background: "transparent" })] });
        await page.evaluate(project => window.musart!.load(project), project);
        await ready(page, project.id, 1);
        outputs.push(await png(page, 2, forceWebGL));
      }
      const metrics = await inspection.evaluate(async outputs => {
        const decode = async (src: string) => { const image = new Image(); image.src = src; await image.decode(); const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height; const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0); return { width: image.width, height: image.height, pixels: context.getImageData(0, 0, image.width, image.height).data }; };
        const a = await decode(outputs[0]!), b = await decode(outputs[1]!);
        let error = 0, count = 0, opaque = 0;
        const ranges = [{ min: 255, max: 0 }, { min: 255, max: 0 }];
        for (let y = 24; y < 136; y++) for (let x = 24; x < 200; x++) {
          const offset = (y * a.width + x) * 4;
          for (let c = 0; c < 3; c++) error += Math.abs(a.pixels[offset + c]! - b.pixels[offset + c]!);
          if (a.pixels[offset + 3] === 255 && b.pixels[offset + 3] === 255) opaque++;
          ranges[0]!.min = Math.min(ranges[0]!.min, a.pixels[offset]!); ranges[0]!.max = Math.max(ranges[0]!.max, a.pixels[offset]!);
          ranges[1]!.min = Math.min(ranges[1]!.min, b.pixels[offset]!); ranges[1]!.max = Math.max(ranges[1]!.max, b.pixels[offset]!);
          count++;
        }
        return { dimensions: [[a.width, a.height], [b.width, b.height]], rgbMean: error / (count * 3), count, opaque, ranges };
      }, outputs);
      const info = await densityEnvironment(page);
      expect(info.backend).toBe(forceWebGL ? "webgl" : "webgpu");
      await mkdir("artifacts", { recursive: true });
      await writeFile(`artifacts/near-integer-dither-${forceWebGL ? "webgl" : "webgpu"}.json`, JSON.stringify({ boundary: "Invariant gray source and high-contrast Bayer, same reference extent96, width95.999 versus96 at2×. Fixed opaque ROI x24..199/y24..135; no pixel registration or ROI search. Protects against switching reconstruction kernels at integer authored bounds.", metrics, environment: info }, null, 2));
      expect(metrics.dimensions).toEqual([[224, 160], [224, 160]]);
      expect(metrics.count).toBe(19712); expect(metrics.opaque).toBe(metrics.count);
      expect(metrics.rgbMean).toBe(0);
      for (const range of metrics.ranges) expect(range).toEqual({ min: 0, max: 255 });
      expect({ gpu: info.reads.gpu, webgl: info.reads.webgl, canvas: info.reads.canvas }).toEqual({ gpu: 0, webgl: 0, canvas: 0 });
    } finally { await inspection.close(); }
  });
