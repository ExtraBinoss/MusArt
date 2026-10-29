import { expect, test, type Page } from "@playwright/test";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  type Asset,
  type Effect,
} from "@musart/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { installWebGLFrameSnapshot, nativeWebGLFrame } from "./support/webgl-frame-snapshot";
import { densityEnvironment } from "./support/effect-density";
import { zoomViewport } from "./support/viewport";

const settings = {
  centerX: 0.4,
  centerY: 0.3,
  innerRadius: 24,
  radius: 80,
  feather: 8,
  falloff: 0.5,
  amplitude: 7,
  wavelength: 24,
  speed: 18,
  phase: 180,
  direction: "outward",
  dispersion: 0.2,
};
const png = (page: Page, forceWebGL: boolean, scale = 1) =>
  page.evaluate((options) => window.musart!.render(options), {
    format: "png" as const,
    forceWebGL,
    scale,
  });
async function ready(page: Page, projectId: string, scale = 1) {
  await page.waitForFunction(
    ({ projectId, scale }) => {
      const d = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
      return (
        d?.projectId === projectId &&
        d.rendererReady === "true" &&
        d.sceneRevision === d.renderedRevision &&
        Number(d.renderWidth) === 256 * scale
      );
    },
    { projectId, scale },
  );
}
async function compare(inspection: Page, reference: string, candidate: string, enlarge = 1) {
  return inspection.evaluate(
    async ({ reference, candidate, enlarge }) => {
      const decode = async (src: string) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return {
          width: image.width,
          height: image.height,
          data: context.getImageData(0, 0, image.width, image.height).data,
        };
      };
      const a = await decode(reference),
        b = await decode(candidate);
      let alphaMax = 0,
        differentBytes = 0,
        maxByte = 0,
        innerMax = 0,
        outerMax = 0,
        annulusError = 0,
        annulusCount = 0,
        rangeMin = 255,
        rangeMax = 0;
      const alphaLevels = new Set<number>();
      for (let y = 0; y < a.height; y++)
        for (let x = 0; x < a.width; x++) {
          const i = (y * a.width + x) * 4;
          alphaLevels.add(a.data[i + 3]!);
          const distance = Math.hypot(
            ((x + 0.5) * 256) / a.width - 32 - 192 * 0.4,
            ((y + 0.5) * 256) / a.height - 32 - 192 * 0.3,
          );
          for (let dy = 0; dy < enlarge; dy++)
            for (let dx = 0; dx < enlarge; dx++) {
              const j = ((y * enlarge + dy) * b.width + x * enlarge + dx) * 4;
              for (let c = 0; c < 4; c++) {
                const error = Math.abs(a.data[i + c]! - b.data[j + c]!);
                differentBytes += Number(error !== 0);
                maxByte = Math.max(maxByte, error);
                if (c === 3) alphaMax = Math.max(alphaMax, error);
                else {
                  if (distance <= 22) innerMax = Math.max(innerMax, error);
                  if (distance >= 82) outerMax = Math.max(outerMax, error);
                  if (distance >= 34 && distance <= 68) {
                    annulusError += error;
                    annulusCount++;
                  }
                }
              }
            }
          if (a.data[i + 3]! > 250) {
            rangeMin = Math.min(rangeMin, a.data[i]!);
            rangeMax = Math.max(rangeMax, a.data[i]!);
          }
        }
      return {
        reference: [a.width, a.height],
        candidate: [b.width, b.height],
        alphaMax,
        alphaLevels: alphaLevels.size,
        differentBytes,
        maxByte,
        innerMax,
        outerMax,
        annulusMean: annulusError / annulusCount,
        valueRange: rangeMax - rangeMin,
      };
    },
    { reference, candidate, enlarge },
  );
}

for (const forceWebGL of [false, true])
  test(`Live Ripple: true photograph, protected subject, deterministic wave, exact zoom/export and alpha (${forceWebGL ? "WebGL fallback" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
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
    const key = forceWebGL ? "webgl" : "webgpu";
    await mkdir("artifacts/ripple", { recursive: true });
    const save = (name: string, url: string) =>
      writeFile(`artifacts/ripple/${key}-${name}.png`, Buffer.from(url.split(",")[1]!, "base64"));
    const bytes = await readFile("apps/web/public/benchmark/50-waterfall-5.jpg");
    const original = await inspection.evaluate(
      async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0, 256, 256);
        // Native source preparation retains real photographic detail and adds
        // fractional coverage so alpha preservation cannot pass with opaque RGB.
        context.globalCompositeOperation = "destination-in";
        const alpha = context.createLinearGradient(0, 0, 0, 256);
        alpha.addColorStop(0, "#ffffffff");
        alpha.addColorStop(0.45, "#ffffffff");
        alpha.addColorStop(0.95, "#ffffff33");
        alpha.addColorStop(1, "#ffffff33");
        context.fillStyle = alpha;
        context.fillRect(0, 0, 256, 256);
        return {
          dimensions: [image.naturalWidth, image.naturalHeight],
          dataUrl: canvas.toDataURL("image/png"),
        };
      },
      `data:image/jpeg;base64,${bytes.toString("base64")}`,
    );
    const originalSize = original.dimensions;
    const asset: Asset = {
      id: "ripple-photo",
      name: "Waterfall photograph with graded alpha",
      mime: "image/png",
      width: 256,
      height: 256,
      dataUrl: original.dataUrl,
    };
    const load = async (override: Partial<Effect> = {}) => {
      const effect = createEffect("ripple", { time: 0.25, settings, ...override });
      const layer = createLayer("image", {
        id: "ripple-image",
        assetId: asset.id,
        x: 32,
        y: 32,
        width: 192,
        height: 192,
        effects: [effect],
      });
      const project = createProject({
        assets: { [asset.id]: asset },
        pages: [
          createPage({
            id: "ripple-page",
            width: 256,
            height: 256,
            background: "transparent",
            layers: [layer],
          }),
        ],
      });
      await page.evaluate((project) => window.musart!.load(project), project);
      await ready(page, project.id);
      return project.id;
    };
    try {
      await load({ amount: 0 });
      const neutral = await png(page, forceWebGL);
      let projectId = await load();
      const wave = await png(page, forceWebGL);
      await save("neutral", neutral);
      await save("wave", wave);
      const displacement = await compare(inspection, neutral, wave);
      expect(displacement.innerMax).toBe(0);
      expect(displacement.outerMax).toBe(0);
      expect(displacement.alphaMax).toBe(0);
      expect(displacement.annulusMean).toBeGreaterThan(1);
      expect(displacement.alphaLevels).toBeGreaterThan(32);
      expect(displacement.valueRange).toBeGreaterThan(100);
      expect((await compare(inspection, wave, await png(page, forceWebGL))).differentBytes).toBe(0);
      await load({ time: 0 });
      const timed = await compare(inspection, wave, await png(page, forceWebGL));
      expect(timed.annulusMean).toBeGreaterThan(1);
      expect(timed.innerMax).toBe(0);
      expect(timed.alphaMax).toBe(0);
      projectId = await load();
      const zooms: unknown[] = [];
      for (const zoom of [0.5, 1, 2]) {
        await page.getByTestId("artboard").hover();
        await zoomViewport(page, zoom);
        await ready(page, projectId, zoom);
        const native = forceWebGL
          ? (await nativeWebGLFrame(page, projectId)).dataUrl
          : await page
              .locator(".editor-gpu-scene canvas")
              .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));
        const exported = await png(page, forceWebGL, zoom);
        await save(`live-${zoom}`, native);
        await save(`export-${zoom}`, exported);
        const metrics = await compare(inspection, exported, native);
        expect(metrics.reference).toEqual([256 * zoom, 256 * zoom]);
        expect(metrics.candidate).toEqual(metrics.reference);
        expect(metrics.differentBytes).toBe(0);
        zooms.push({ zoom, metrics });
      }
      const enlarged = await compare(inspection, wave, await png(page, forceWebGL, 2), 2);
      expect(enlarged.differentBytes).toBe(0);
      const edgeCases: unknown[] = [];
      for (const [name, values] of [
        ["zero-amplitude", { amplitude: 0 }],
        ["collapsed-annulus", { innerRadius: 80, radius: 80 }],
        ["reversed-radii", { innerRadius: 8192, radius: 1 }],
        ["maximum-collapsed-radius", { innerRadius: 8192, radius: 8192, feather: 0, falloff: 0 }],
      ] as const) {
        projectId = await load({ settings: { ...settings, ...values } });
        const metrics = await compare(inspection, neutral, await png(page, forceWebGL));
        expect(metrics.differentBytes, name).toBe(0);
        edgeCases.push({ name, metrics });
      }
      await load({ settings: { ...settings, speed: 0 }, time: 0 });
      const still = await png(page, forceWebGL);
      await load({ settings: { ...settings, speed: 0 }, time: 86400 });
      expect((await compare(inspection, still, await png(page, forceWebGL))).differentBytes).toBe(
        0,
      );
      await load({ settings: { ...settings, direction: "inward", phase: 45 } });
      const direction = await compare(inspection, wave, await png(page, forceWebGL));
      expect(direction.maxByte).toBeLessThanOrEqual(1);
      await load({ settings: { ...settings, phase: 0 } });
      const cycle = await png(page, forceWebGL);
      await load({ settings: { ...settings, phase: 360 } });
      expect(
        (await compare(inspection, cycle, await png(page, forceWebGL))).maxByte,
      ).toBeLessThanOrEqual(1);
      const periodicSettings = { ...settings, speed: 1024, wavelength: 2, phase: 0 };
      await load({ settings: periodicSettings, time: 0 });
      const periodicZero = await png(page, forceWebGL);
      await load({ settings: periodicSettings, time: 86400 });
      const periodicMaximum = await png(page, forceWebGL);
      await save("maximum-time-zero-phase-reference", periodicZero);
      await save("maximum-time-periodic-equivalent", periodicMaximum);
      const maximumTimeEquivalent = await compare(inspection, periodicZero, periodicMaximum);
      const maximumTimeDistortion = await compare(inspection, neutral, periodicMaximum);
      expect(maximumTimeEquivalent.differentBytes).toBe(0);
      expect(maximumTimeDistortion.annulusMean).toBeGreaterThan(1);
      expect(maximumTimeDistortion.innerMax).toBe(0);
      expect(maximumTimeDistortion.outerMax).toBe(0);
      expect(maximumTimeDistortion.alphaMax).toBe(0);
      await load({ seed: 3 });
      expect((await compare(inspection, wave, await png(page, forceWebGL))).differentBytes).toBe(0);
      await load({
        settings: {
          ...settings,
          centerX: 0.5 / 192,
          centerY: 0.5 / 192,
          innerRadius: 0,
          radius: 8192,
          amplitude: 256,
          wavelength: 2,
          speed: 1024,
          feather: 0,
          falloff: 0,
          dispersion: 1,
        },
        time: 86400,
      });
      const extremes = await compare(inspection, neutral, await png(page, forceWebGL));
      expect(extremes.alphaMax).toBe(0);
      expect(extremes.valueRange).toBeGreaterThan(100);
      await load();
      const environment = await densityEnvironment(page);
      expect(environment.backend).toBe(forceWebGL ? "webgl" : "webgpu");
      expect(errors).toEqual([]);
      expect({
        gpu: environment.reads.gpu,
        webgl: environment.reads.webgl,
        canvas: environment.reads.canvas,
      }).toEqual({ gpu: 0, webgl: 0, canvas: 0 });
      await writeFile(
        `artifacts/ripple/${key}.json`,
        JSON.stringify(
          {
            boundary:
              "True photograph; every source-alpha byte, fixed protected disk/exterior, nonzero annular distortion, exact native editor-vs-export RGBA at matched densities, canonical1×/2× identity, deterministic explicit time and seed independence. Native inspection decoding is isolated from production readback instrumentation.",
            settings,
            originalSize,
            displacement,
            timed,
            enlarged,
            zooms,
            edgeCases,
            direction,
            extremes,
            maximumTimeEquivalent,
            maximumTimeDistortion,
            errors,
            environment,
          },
          null,
          2,
        ),
      );
    } finally {
      if (forceWebGL)
        await page.evaluate(() => {
          window.__stopLiveWebGLSnapshot?.();
          delete window.__stopLiveWebGLSnapshot;
        });
      await inspection.close();
    }
  });
