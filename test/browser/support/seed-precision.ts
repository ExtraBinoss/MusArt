import { createEffect, type EffectType } from "@musart/core";
import type { Page } from "@playwright/test";

export const SEEDED_EFFECTS = [
  "noise",
  "shatter",
  "flashlight",
  "cyanotype",
  "datamosh",
  "crt",
  "receipt",
  "bit-dither",
  "pink-phosphor",
] as const satisfies readonly EffectType[];
export function seedPrecisionEffect(type: (typeof SEEDED_EFFECTS)[number], seed: number) {
  const settings = {
    noise: { algorithm: "perlin", contrast: 2 },
    shatter: { pattern: "impact", radius: 1.2 },
    flashlight: { grain: 0.5, grainSize: 1, ambient: 0.2 },
    cyanotype: { paperGrain: 0.3, fibers: 0.3, unevenness: 1, textureScale: 32 },
    datamosh: { density: 1, displacement: 24, blockSize: 16 },
    crt: { noise: 0.3, jitter: 2, flicker: 0, rollingBar: 0 },
    receipt: { paperTexture: 0.3, wear: 0.4, streaks: 0.4 },
    "bit-dither": { method: "bayer4" },
    "pink-phosphor": { grain: 0.5, flicker: 0, glow: 0, scanlines: 0, speed: 1 },
  }[type];
  return createEffect(type, {
    seed,
    time: 0,
    ...(type === "noise" ? { scale: 32 } : {}),
    settings,
  });
}

declare global {
  interface Window {
    __seedUniformLayouts?: { wgsl: number; glsl: number; examples: string[] };
  }
}
/** Inspect only CPU shader descriptors/declarations, never GPU buffers or pixels. */
export async function installSeedLayoutProbe(page: Page) {
  await page.addInitScript(() => {
    const data = (window.__seedUniformLayouts = { wgsl: 0, glsl: 0, examples: [] as string[] });
    const record = (kind: "wgsl" | "glsl", declaration: string) => {
      data[kind]++;
      if (data.examples.length < 12) data.examples.push(`${kind}: ${declaration}`);
    };
    if (typeof GPUDevice !== "undefined") {
      const original = GPUDevice.prototype.createShaderModule;
      GPUDevice.prototype.createShaderModule = function (descriptor) {
        const code = descriptor.code;
        for (const struct of code.matchAll(/struct\s+(\w+)\s*\{([^}]+)\}/g)) {
          const field = struct[2]!.match(/\b\w+\s*:\s*u32\b/);
          if (field && new RegExp(`var<uniform>\\s+\\w+\\s*:\\s*${struct[1]}\\b`).test(code))
            record("wgsl", field[0]);
        }
        return Reflect.apply(original, this, [descriptor]);
      };
    }
    for (const constructor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!constructor) continue;
      const original = constructor.prototype.shaderSource;
      constructor.prototype.shaderSource = function (shader, code) {
        const direct = code.match(/\buniform\s+uint\s+\w+/);
        if (direct) record("glsl", direct[0]);
        for (const block of code.matchAll(/\buniform\s+\w+\s*\{([^}]+)\}/g)) {
          const field = block[1]!.match(/\buint\s+\w+\s*;/);
          if (field) record("glsl", field[0]);
        }
        return Reflect.apply(original, this, [shader, code]);
      };
    }
  });
}
