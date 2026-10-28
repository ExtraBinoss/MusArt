import type { Page } from "@playwright/test";
export interface ReadbackCounts {
  gpu: number;
  webgl: number;
  canvas: number;
  gpuHook: boolean;
  webglHook: boolean;
  canvasHook: boolean;
}
declare global {
  interface Window {
    __musartVideoReadbacks?: ReadbackCounts;
  }
}
/** Instrument actual JS read APIs before editor imports. Inspection pages have no probe. */
export async function installReadbackProbe(page: Page) {
  await page.addInitScript(() => {
    const probe: ReadbackCounts = {
      gpu: 0,
      webgl: 0,
      canvas: 0,
      gpuHook: false,
      webglHook: false,
      canvasHook: false,
    };
    window.__musartVideoReadbacks = probe;
    if (typeof GPUBuffer !== "undefined") {
      const original = GPUBuffer.prototype.mapAsync;
      GPUBuffer.prototype.mapAsync = function (mode, ...args) {
        if (mode & 1) probe.gpu++;
        return original.call(this, mode, ...args);
      };
      probe.gpuHook = true;
    }
    for (const prototype of [
      globalThis.WebGLRenderingContext?.prototype,
      globalThis.WebGL2RenderingContext?.prototype,
    ]) {
      if (!prototype) continue;
      const original = prototype.readPixels;
      prototype.readPixels = function (...args: Parameters<typeof original>) {
        probe.webgl++;
        return Reflect.apply(original, this, args);
      };
      probe.webglHook = true;
    }
    const original = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (
      ...args: Parameters<typeof original>
    ) {
      probe.canvas++;
      return Reflect.apply(original, this, args);
    };
    probe.canvasHook = true;
  });
}
