import { expect, type Page } from "@playwright/test";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  type Asset,
  type Effect,
  type EffectType,
} from "@musart/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./readback-probe";
import { installWebGLFrameSnapshot, nativeWebGLFrame } from "./webgl-frame-snapshot";
import { zoomViewport } from "./viewport";

/** Independent native PNG inspection is never charged to production readback counters. */
export async function imageDifference(
  inspection: Page,
  reference: string,
  candidate: string,
  enlarge = 1,
) {
  return inspection.evaluate(
    async ({ reference, candidate, enlarge }) => {
      const decode = async (src: string) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        return {
          width: image.width,
          height: image.height,
          data: ctx.getImageData(0, 0, image.width, image.height).data,
        };
      };
      const a = await decode(reference),
        b = await decode(candidate);
      let differentBytes = 0,
        alphaMax = 0,
        maxByte = 0,
        sum = 0,
        opaqueSum = 0,
        opaqueCount = 0;
      for (let y = 0; y < a.height; y++)
        for (let x = 0; x < a.width; x++) {
          const i = (y * a.width + x) * 4;
          for (let dy = 0; dy < enlarge; dy++)
            for (let dx = 0; dx < enlarge; dx++) {
              const j = ((y * enlarge + dy) * b.width + x * enlarge + dx) * 4;
              for (let c = 0; c < 4; c++) {
                const error = Math.abs(a.data[i + c]! - b.data[j + c]!);
                if (error !== 0) differentBytes++;
                maxByte = Math.max(maxByte, error);
                if (c === 3) alphaMax = Math.max(alphaMax, error);
                else {
                  sum += error;
                  if (a.data[i + 3] === 255) {
                    opaqueSum += error;
                    opaqueCount++;
                  }
                }
              }
            }
        }
      return {
        reference: [a.width, a.height],
        candidate: [b.width, b.height],
        differentBytes,
        alphaMax,
        maxByte,
        meanRGB: sum / (a.width * a.height * 3 * enlarge * enlarge),
        opaqueMeanRGB: opaqueSum / Math.max(1, opaqueCount),
      };
    },
    { reference, candidate, enlarge },
  );
}

export async function photographicEffect(page: Page, type: EffectType, forceWebGL: boolean) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  if (forceWebGL) {
    await installWebGLFrameSnapshot(page);
    await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
  }
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const inspection = await page.context().newPage();
  await page.bringToFront();
  const bytes = await readFile("apps/web/public/benchmark/50-waterfall-5.jpg");
  const dataUrl = await inspection.evaluate(
    async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 192;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0, 192, 192);
      ctx.globalCompositeOperation = "destination-in";
      const gradient = ctx.createLinearGradient(0, 0, 0, 192);
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.55, "#ffffff");
      gradient.addColorStop(1, "#ffffff33");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 192, 192);
      return canvas.toDataURL("image/png");
    },
    `data:image/jpeg;base64,${bytes.toString("base64")}`,
  );
  const asset: Asset = {
    id: `${type}-photo`,
    name: "Native photographic fixture with graded coverage",
    width: 192,
    height: 192,
    mime: "image/png",
    dataUrl,
  };
  const ready = async (id: string, zoom = 1) => {
    await page.waitForFunction(
      ({ id, zoom }) => {
        const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
        return (
          data?.projectId === id &&
          data.rendererReady === "true" &&
          data.sceneRevision === data.renderedRevision &&
          Number(data.renderWidth) === 256 * zoom
        );
      },
      { id, zoom },
    );
  };
  const load = async (override: Partial<Effect> = {}, source = asset) => {
    const effect = createEffect(type, override);
    const project = createProject({
      assets: { [source.id]: source },
      pages: [
        createPage({
          id: `${type}-page`,
          width: 256,
          height: 256,
          background: "transparent",
          layers: [
            createLayer("image", {
              id: `${type}-image`,
              x: 32,
              y: 32,
              width: 192,
              height: 192,
              assetId: source.id,
              effects: [effect],
            }),
          ],
        }),
      ],
    });
    await page.evaluate((project) => window.musart!.load(project), project);
    await ready(project.id);
    return project.id;
  };
  const png = (scale = 1) =>
    page.evaluate((options) => window.musart!.render(options), {
      format: "png" as const,
      scale,
      forceWebGL,
    });
  const backend = forceWebGL ? "webgl" : "webgpu";
  const save = async (name: string, value: string) => {
    await mkdir(`artifacts/${type}`, { recursive: true });
    await writeFile(
      `artifacts/${type}/${backend}-${name}.png`,
      Buffer.from(value.split(",")[1]!, "base64"),
    );
  };
  const compare = (reference: string, candidate: string, enlarge = 1) =>
    imageDifference(inspection, reference, candidate, enlarge);
  const matchedZooms = async (id: string) => {
    const results = [];
    for (const zoom of [0.625, 1, 2]) {
      await page.getByTestId("artboard").hover();
      await zoomViewport(page, zoom);
      await ready(id, zoom);
      const live = forceWebGL
        ? (await nativeWebGLFrame(page, id)).dataUrl
        : await page
            .locator(".editor-gpu-scene canvas")
            .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));
      const exported = await png(zoom),
        metrics = await compare(exported, live);
      expect(metrics.reference).toEqual([256 * zoom, 256 * zoom]);
      expect(metrics.candidate).toEqual(metrics.reference);
      expect(metrics.differentBytes).toBe(0);
      await save(`live-${zoom}`, live);
      await save(`export-${zoom}`, exported);
      results.push({ zoom, metrics });
    }
    return results;
  };
  const close = async () => {
    if (forceWebGL)
      await page.evaluate(() => {
        window.__stopLiveWebGLSnapshot?.();
        delete window.__stopLiveWebGLSnapshot;
      });
    await inspection.close();
  };
  return { load, ready, png, compare, save, matchedZooms, close, errors, inspection, backend };
}
