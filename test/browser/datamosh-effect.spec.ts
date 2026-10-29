import { expect, test, type Page } from "@playwright/test";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  type Asset,
  type Effect,
  type Project,
} from "@musart/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { installWebGLFrameSnapshot, nativeWebGLFrame } from "./support/webgl-frame-snapshot";
import { densityEnvironment } from "./support/effect-density";
import { zoomViewport } from "./support/viewport";

const png = (page: Page, forceWebGL: boolean, scale = 1) =>
  page.evaluate((options) => window.musart!.render(options), {
    format: "png" as const,
    forceWebGL,
    scale,
  });
async function ready(page: Page, projectId: string, width = 256) {
  await page.waitForFunction(
    ({ projectId, width }) => {
      const d = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
      return (
        d?.projectId === projectId &&
        d.rendererReady === "true" &&
        d.sceneRevision === d.renderedRevision &&
        Number(d.renderWidth) === width
      );
    },
    { projectId, width },
  );
}
async function load(page: Page, project: Project) {
  await page.evaluate((project) => window.musart!.load(project), project);
  await ready(page, project.id);
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
      const channelMax = [0, 0, 0, 0],
        alphaLevels = new Set<number>(),
        colors = new Set<string>();
      let differentBytes = 0,
        changedPixels = 0,
        rgbError = 0,
        opaque = 0;
      for (let y = 0; y < a.height; y++)
        for (let x = 0; x < a.width; x++) {
          const i = (y * a.width + x) * 4;
          for (let dy = 0; dy < enlarge; dy++)
            for (let dx = 0; dx < enlarge; dx++) {
              const j = ((y * enlarge + dy) * b.width + x * enlarge + dx) * 4;
              let changed = false;
              for (let c = 0; c < 4; c++) {
                const error = Math.abs(a.data[i + c]! - b.data[j + c]!);
                channelMax[c] = Math.max(channelMax[c]!, error);
                differentBytes += Number(error !== 0);
                changed ||= error !== 0;
                if (c < 3) rgbError += error;
              }
              changedPixels += Number(changed);
            }
        }
      for (let i = 0; i < b.data.length; i += 4) {
        alphaLevels.add(b.data[i + 3]!);
        if (b.data[i + 3] === 255) {
          opaque++;
          colors.add(`${b.data[i]},${b.data[i + 1]},${b.data[i + 2]}`);
        }
      }
      return {
        reference: [a.width, a.height],
        candidate: [b.width, b.height],
        differentBytes,
        changedPixels,
        rgbMean: rgbError / (a.width * a.height * enlarge * enlarge * 3),
        channelMax,
        alphaLevels: alphaLevels.size,
        opaque,
        opaqueColors: colors.size,
      };
    },
    { reference, candidate, enlarge },
  );
}
async function rampDisplacement(
  inspection: Page,
  reference: string,
  candidate: string,
  direction: 0 | 90,
) {
  return inspection.evaluate(
    async ({ reference, candidate, direction }) => {
      const decode = async (src: string) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      };
      const a = await decode(reference),
        b = await decode(candidate);
      const hash = (x: number, y: number, seed: number) => {
        let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) >>> 0;
        n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
        n = (n ^ (n >>> 16)) >>> 0;
        return (n & 16777215) / 16777215;
      };
      let max = 0,
        total = 0,
        samples = 0;
      const rowOffsets: Record<string, number> = {};
      for (let y = 32; y < 224; y++)
        for (let x = 32; x < 224; x++) {
          const row = Math.floor((y + 0.5) / 24),
            displacement = 24 * (0.35 + 0.65 * hash(7, row + 43, 42));
          rowOffsets[row] = displacement;
          const sx = direction === 0 ? Math.floor(x + 0.5 - displacement) : x,
            sy = direction === 90 ? Math.floor(y + 0.5 - displacement) : y;
          const i = (y * 256 + x) * 4,
            j = (sy * 256 + sx) * 4;
          for (let c = 0; c < 3; c++) {
            const error = Math.abs(b[i + c]! - a[j + c]!);
            max = Math.max(max, error);
            total += error;
          }
          samples++;
        }
      return { samples, max, mean: total / (samples * 3), rowOffsets };
    },
    { reference, candidate, direction },
  );
}

for (const forceWebGL of [false, true])
  test(`Datamosh Block Smear: genuine photograph, predicted macroblock displacement, explicit phase and exact export (${forceWebGL ? "WebGL fallback" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await installReadbackProbe(page);
    if (forceWebGL) {
      await installWebGLFrameSnapshot(page);
      await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
    }
    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    const inspection = await page.context().newPage();
    await page.bringToFront();
    await mkdir("artifacts/datamosh", { recursive: true });
    const key = forceWebGL ? "webgl" : "webgpu";
    const save = (name: string, url: string) =>
      writeFile(`artifacts/datamosh/${key}-${name}.png`, Buffer.from(url.split(",")[1]!, "base64"));
    try {
      const bytes = await readFile("apps/web/public/benchmark/50-waterfall-5.jpg");
      const prepared = await inspection.evaluate(
        async (src) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 256;
          const context = canvas.getContext("2d")!;
          context.drawImage(image, 0, 0, 256, 256);
          context.globalCompositeOperation = "destination-in";
          const alpha = context.createLinearGradient(0, 0, 0, 256);
          alpha.addColorStop(0, "#ffffffff");
          alpha.addColorStop(0.45, "#ffffffff");
          alpha.addColorStop(0.95, "#ffffff33");
          alpha.addColorStop(1, "#ffffff33");
          context.fillStyle = alpha;
          context.fillRect(0, 0, 256, 256);
          const photo = canvas.toDataURL("image/png");
          context.globalCompositeOperation = "copy";
          const red = context.createLinearGradient(0, 0, 256, 0);
          red.addColorStop(0, "#000000");
          red.addColorStop(1, "#ff0000");
          context.fillStyle = red;
          context.fillRect(0, 0, 256, 256);
          context.globalCompositeOperation = "lighter";
          const green = context.createLinearGradient(0, 0, 0, 256);
          green.addColorStop(0, "#000000");
          green.addColorStop(1, "#00ff00");
          context.fillStyle = green;
          context.fillRect(0, 0, 256, 256);
          return {
            photo,
            ramp: canvas.toDataURL("image/png"),
            originalSize: [image.naturalWidth, image.naturalHeight],
          };
        },
        `data:image/jpeg;base64,${bytes.toString("base64")}`,
      );
      const asset = (dataUrl: string): Asset => ({
        id: "datamosh-source",
        name: "Photograph or RGB ramp",
        mime: "image/png",
        width: 256,
        height: 256,
        dataUrl,
      });
      const project = (dataUrl: string, overrides: Partial<Effect> = {}, inset = true) => {
        const source = asset(dataUrl);
        return createProject({
          assets: { [source.id]: source },
          pages: [
            createPage({
              id: "datamosh-page",
              width: 256,
              height: 256,
              background: "transparent",
              layers: [
                createLayer("image", {
                  id: "datamosh-owner",
                  assetId: source.id,
                  x: inset ? 32 : 0,
                  y: inset ? 32 : 0,
                  width: inset ? 192 : 256,
                  height: inset ? 192 : 256,
                  effects: [createEffect("datamosh", overrides)],
                }),
              ],
            }),
          ],
        });
      };
      const renderPhoto = async (name: string, overrides: Partial<Effect>) => {
        await load(page, project(prepared.photo, overrides));
        const result = await png(page, forceWebGL);
        await save(name, result);
        return result;
      };
      const neutral = await renderPhoto("neutral", { amount: 0 }),
        original = await renderPhoto("photo", {});
      const photographic = await compare(inspection, neutral, original);
      expect(photographic.rgbMean).toBeGreaterThan(2);
      expect(photographic.changedPixels).toBeGreaterThan(2000);
      expect(photographic.changedPixels).toBeLessThan(192 * 192 * 0.9);
      expect(photographic.channelMax[3]).toBe(0);
      expect(photographic.alphaLevels).toBeGreaterThan(32);
      expect(photographic.opaqueColors).toBeGreaterThan(500);
      expect(
        (await compare(inspection, original, await png(page, forceWebGL))).differentBytes,
      ).toBe(0);
      const defaultProject = project(prepared.photo);
      await load(page, defaultProject);
      const zooms: unknown[] = [];
      for (const zoom of [0.5, 1, 2]) {
        await page.getByTestId("artboard").hover();
        await zoomViewport(page, zoom);
        await ready(page, defaultProject.id, 256 * zoom);
        const native = forceWebGL
          ? (await nativeWebGLFrame(page, defaultProject.id)).dataUrl
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
      const enlarged = await compare(inspection, original, await png(page, forceWebGL, 2), 2);
      expect(enlarged.differentBytes).toBe(0);
      const clear = await compare(
        inspection,
        neutral,
        await renderPhoto("density-zero", { settings: { density: 0 } }),
      );
      expect(clear.differentBytes).toBe(0);
      const zero = await compare(
        inspection,
        neutral,
        await renderPhoto("zero-transform", {
          levels: 256,
          settings: { density: 1, displacement: 0, smear: 1, chromaShift: 0 },
        }),
      );
      expect(zero.differentBytes).toBe(0);
      const seeded = await compare(
        inspection,
        original,
        await renderPhoto("different-seed", { seed: 9321 }),
      );
      expect(seeded.differentBytes).toBeGreaterThan(2000);
      const timed = await compare(
        inspection,
        original,
        await renderPhoto("different-phase", { time: 1 }),
      );
      expect(timed.differentBytes).toBeGreaterThan(2000);
      const phaseOne = await renderPhoto("phase-one-rate2", { time: 0.5, settings: { rate: 2 } });
      const phaseEquivalent = await compare(
        inspection,
        phaseOne,
        await renderPhoto("phase-one-rate4", { time: 0.25, settings: { rate: 4 } }),
      );
      expect(phaseEquivalent.differentBytes).toBe(0);
      const stopped = await renderPhoto("rate-zero", { settings: { rate: 0 } });
      expect(
        (
          await compare(
            inspection,
            stopped,
            await renderPhoto("rate-zero-time", { time: 86400, settings: { rate: 0 } }),
          )
        ).differentBytes,
      ).toBe(0);
      const variation = {
        density: 1,
        rate: 0,
        displacement: 48,
        angleVariation: 60,
        coherence: 0,
        smear: 0,
        chromaShift: 0,
      };
      const displaced = await renderPhoto("displaced", { settings: variation });
      const blockSize = await compare(
        inspection,
        displaced,
        await renderPhoto("different-block-size", { settings: { ...variation, blockSize: 48 } }),
      );
      expect(blockSize.rgbMean).toBeGreaterThan(1);
      const smear = await compare(
        inspection,
        displaced,
        await renderPhoto("smear", { settings: { ...variation, smear: 1 } }),
      );
      expect(smear.rgbMean).toBeGreaterThan(1);
      const coherent = await compare(
        inspection,
        displaced,
        await renderPhoto("coherent", { settings: { ...variation, coherence: 1 } }),
      );
      expect(coherent.rgbMean).toBeGreaterThan(1);
      const chroma = await compare(
        inspection,
        displaced,
        await renderPhoto("chroma", { settings: { ...variation, chromaShift: 12 } }),
      );
      expect(chroma.rgbMean).toBeGreaterThan(1);
      expect(chroma.channelMax[1]).toBe(0);
      expect(chroma.channelMax[3]).toBe(0);
      const settings = {
        blockSize: 24,
        density: 1,
        displacement: 24,
        direction: 0,
        angleVariation: 0,
        coherence: 1,
        smear: 0,
        chromaShift: 0,
        rate: 0,
      };
      await load(page, project(prepared.ramp, { amount: 0 }, false));
      const ramp = await png(page, forceWebGL);
      await save("ramp", ramp);
      const motion: unknown[] = [];
      for (const direction of [0, 90] as const) {
        await load(
          page,
          project(prepared.ramp, { levels: 256, settings: { ...settings, direction } }, false),
        );
        const candidate = await png(page, forceWebGL);
        await save(`ramp-${direction}`, candidate);
        const metrics = await rampDisplacement(inspection, ramp, candidate, direction);
        expect(metrics.samples).toBe(36864);
        expect(metrics.max).toBeLessThanOrEqual(1);
        motion.push({ direction, metrics });
      }
      await load(page, project(prepared.ramp, { levels: 2, settings }, false));
      const quantized = await png(page, forceWebGL);
      await save("ramp-quantized", quantized);
      const levels = await compare(inspection, ramp, quantized);
      expect(levels.opaqueColors).toBe(4);
      const bounds = await renderPhoto("maximum-bounds", {
        settings: {
          blockSize: 2,
          density: 1,
          displacement: 512,
          direction: -180,
          angleVariation: 180,
          coherence: 1,
          smear: 1,
          chromaShift: 64,
          rate: 30,
        },
        time: 86400,
        levels: 2,
      });
      expect((await compare(inspection, neutral, bounds)).channelMax[3]).toBe(0);
      const environment = await densityEnvironment(page);
      expect(environment.backend).toBe(forceWebGL ? "webgl" : "webgpu");
      expect(errors).toEqual([]);
      expect({
        gpu: environment.reads.gpu,
        webgl: environment.reads.webgl,
        canvas: environment.reads.canvas,
      }).toEqual({ gpu: 0, webgl: 0, canvas: 0 });
      await writeFile(
        `artifacts/datamosh/${key}.json`,
        JSON.stringify(
          {
            boundary:
              "Spatial codec-inspired block smear on a real still photograph, no history/motion estimation. Fixed four-tap trail plus chroma, exact source alpha, deterministic explicit phase/seed and source identity controls, independently predicted macroblock offsets, full RGBA live/export at matched density.",
            originalSize: prepared.originalSize,
            photographic,
            zooms,
            enlarged,
            clear,
            zero,
            seeded,
            timed,
            phaseEquivalent,
            blockSize,
            smear,
            coherent,
            chroma,
            motion,
            levels,
            environment,
            errors,
          },
          null,
          2,
        ),
      );
    } finally {
      await writeFile(
        `artifacts/datamosh/${key}-diagnostics.json`,
        JSON.stringify({ errors }, null, 2),
      );
      if (forceWebGL)
        await page.evaluate(() => {
          window.__stopLiveWebGLSnapshot?.();
          delete window.__stopLiveWebGLSnapshot;
        });
      await inspection.close();
    }
  });
