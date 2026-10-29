import type { Page } from "@playwright/test";
import type { ImageRegion } from "./image-probe";
import { zoomViewport } from "./viewport";

interface LibraryFrameAck {
  projectId: string;
  renders: number;
  renderWidth: number;
  renderHeight: number;
  targets: number;
  cacheBytes: number;
}

declare global {
  interface Window {
    __libraryGPUContexts?: number;
    __libraryFrameAcks?: LibraryFrameAck[];
  }
}
export const EDITOR_SURFACES = [
  ".musart-app",
  ".inspector",
  ".canvas-area",
  ".editor-canvas",
  ".editor-gpu-scene",
];
export interface LibraryGpuStats extends Record<string, number> {
  renders: number;
  uploads: number;
  targets: number;
  cacheBytes: number;
  maxBytes: number;
  frames: number;
  passes: number;
  displayFrames: number;
}
export async function installLibraryContextProbe(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext,
      seen = new WeakSet<HTMLCanvasElement>();
    window.__libraryGPUContexts = 0;
    window.__libraryFrameAcks = [];
    let previousFrame = "";
    new MutationObserver(() => {
      const d = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
      if (!d?.projectId || !d.renderCount || !d.renderWidth) return;
      const key = `${d.projectId}:${d.renderCount}:${d.renderWidth}`;
      if (key === previousFrame) return;
      previousFrame = key;
      const stats = JSON.parse(d.gpuStats ?? "{}");
      window.__libraryFrameAcks!.push({
        projectId: d.projectId,
        renders: Number(d.renderCount),
        renderWidth: Number(d.renderWidth),
        renderHeight: Number(d.renderHeight),
        targets: Number(stats.targets),
        cacheBytes: Number(stats.cacheBytes),
      });
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-render-count", "data-rendered-revision"],
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
        const result: unknown = Reflect.apply(original, this, args);
        if (result && ["webgpu", "webgl", "webgl2"].includes(args[0]) && !seen.has(this)) {
          seen.add(this);
          window.__libraryGPUContexts = (window.__libraryGPUContexts ?? 0) + 1;
        }
        return result;
      },
    });
  });
}
export async function libraryFrame(page: Page, projectId: string, previous?: number) {
  await page.waitForFunction(
    ({ projectId, previous }) => {
      const d = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
      return (
        d?.projectId === projectId &&
        d.rendererReady === "true" &&
        d.sceneRevision === d.renderedRevision &&
        (previous === undefined || Number(d.renderCount) > previous)
      );
    },
    { projectId, previous },
    { timeout: 120000 },
  );
  return page.locator(".editor-gpu-scene canvas").evaluate((canvas) => {
    const c = canvas as HTMLCanvasElement;
    return {
      ...JSON.parse(c.dataset.gpuStats ?? "{}"),
      renders: Number(c.dataset.renderCount),
      renderWidth: Number(c.dataset.renderWidth),
      renderHeight: Number(c.dataset.renderHeight),
      canvasWidth: c.width,
      canvasHeight: c.height,
      viewZoom: Number(
        document.querySelector<HTMLElement>('[data-testid="artboard"]')?.dataset.zoom,
      ),
      dpr: devicePixelRatio,
    } as LibraryGpuStats;
  });
}
export const libraryCommits = (page: Page) =>
  page.evaluate(
    (selectors) =>
      selectors.map((selector) =>
        Number(document.querySelector(selector)?.getAttribute("data-react-renders") ?? 0),
      ),
    EDITOR_SURFACES,
  );

/** Functional allocation comparisons need the same cache history, not an arbitrary sleep. */
export async function libraryDensityCycle(page: Page, projectId: string) {
  const fit = Number(await page.getByTestId("artboard").getAttribute("data-zoom"));
  if (!(fit > 0 && fit < 1))
    throw new Error("The fifty-image viewport must start at its minified fit.");
  const settled = async (zoom: number) => {
    await page.waitForFunction(
      ({ projectId, zoom }) => {
        const a = document.querySelector<HTMLElement>('[data-testid="artboard"]');
        const d = a?.querySelector<HTMLCanvasElement>("canvas")?.dataset;
        const scale = Math.round(zoom * devicePixelRatio * 1_000_000) / 1_000_000;
        return (
          a?.dataset.viewMoving === "false" &&
          d?.projectId === projectId &&
          d.rendererReady === "true" &&
          d.sceneRevision === d.renderedRevision &&
          Number(d.renderWidth) === Math.ceil(2400 * scale) &&
          Number(d.renderHeight) === Math.ceil(1500 * scale)
        );
      },
      { projectId, zoom },
    );
    return libraryFrame(page, projectId);
  };
  await page.getByTestId("artboard").hover();
  await zoomViewport(page, 1);
  const native = await settled(1);
  await zoomViewport(page, fit);
  return {
    native,
    fit: await settled(fit),
    frames: await page.evaluate(() => window.__libraryFrameAcks!),
  };
}
export const libraryCanvas = (page: Page) =>
  page
    .locator(".editor-gpu-scene canvas")
    .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));
export const libraryPng = (page: Page, scale = 1) =>
  page.evaluate((scale) => window.musart!.render({ format: "png", scale }), scale);

export async function libraryThumbnail(page: Page) {
  return page.evaluate(async () => {
    await window.musart!.flushThumbnails();
    const { project, pageId } = window.musart!.snapshot();
    const record = await new Promise<{ blob: Blob; width: number; height: number } | undefined>(
      (resolve, reject) => {
        const request = indexedDB.open("musart-studio");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("thumbnails"),
            get = tx.objectStore("thumbnails").get([project.id, pageId]);
          let result: { blob: Blob; width: number; height: number } | undefined;
          get.onsuccess = () => {
            result = get.result;
          };
          get.onerror = () => reject(get.error);
          tx.oncomplete = () => {
            db.close();
            resolve(result);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      },
    );
    if (!record)
      throw new Error("The genuine fifty-image library has no persisted canonical thumbnail.");
    const encoded = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("Thumbnail data URL missing"));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(record.blob);
    });
    return {
      encoded,
      width: record.width,
      height: record.height,
      bytes: record.blob.size,
      type: record.blob.type,
    };
  });
}
export async function compareLibraryRegions(
  inspector: Page,
  reference: string,
  candidate: string,
  regions: ImageRegion[],
) {
  return inspector.evaluate(
    async ({ reference, candidate, regions }) => {
      const decode = async (src: string) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const c = canvas.getContext("2d")!;
        c.drawImage(image, 0, 0);
        return {
          width: image.width,
          height: image.height,
          data: c.getImageData(0, 0, image.width, image.height).data,
        };
      };
      const a = await decode(reference),
        b = await decode(candidate);
      if (a.width !== b.width || a.height !== b.height)
        throw new Error("Library comparison needs matching physical dimensions.");
      return regions.map((region) => {
        let error = 0,
          count = 0,
          alphaMax = 0;
        for (
          let y = Math.ceil(region.y * a.height);
          y < Math.floor((region.y + region.height) * a.height);
          y++
        )
          for (
            let x = Math.ceil(region.x * a.width);
            x < Math.floor((region.x + region.width) * a.width);
            x++
          ) {
            const i = (y * a.width + x) * 4;
            for (let c = 0; c < 3; c++) error += Math.abs(a.data[i + c]! - b.data[i + c]!);
            alphaMax = Math.max(alphaMax, Math.abs(a.data[i + 3]! - b.data[i + 3]!));
            count++;
          }
        return { pixels: count, rgbMean: error / (count * 3), alphaMax };
      });
    },
    { reference, candidate, regions },
  );
}
export async function libraryAlpha(inspector: Page, source: string) {
  return inspector.evaluate(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const c = canvas.getContext("2d")!;
    c.drawImage(image, 0, 0);
    const pixels = c.getImageData(0, 0, image.width, image.height).data,
      levels = new Set<number>();
    for (let i = 3; i < pixels.length; i += 4) levels.add(pixels[i]!);
    const alpha = (x: number, y: number) =>
      pixels[(Math.floor(y) * image.width + Math.floor(x)) * 4 + 3]!;
    return {
      width: image.width,
      height: image.height,
      levels: levels.size,
      corner: alpha(0, 0),
      translucentPhoto: alpha(48 + 110, 235 + 82.5),
      opaquePhoto: alpha(48 + 230 + 110, 235 + 82.5),
    };
  }, source);
}
