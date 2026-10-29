import { expect, test, type Page } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject, type Effect } from "@musart/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { installWebGLFrameSnapshot, nativeWebGLFrame } from "./support/webgl-frame-snapshot";
import { densityEnvironment } from "./support/effect-density";
import { zoomViewport } from "./support/viewport";

test.use({ deviceScaleFactor: 1.25 });
async function pixels(inspector: Page, baseline: string, candidate: string) {
  return inspector.evaluate(
    async ({ baseline, candidate }) => {
      const decode = async (url: string) => {
        const image = new Image();
        image.src = url;
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
      const a = await decode(baseline),
        b = await decode(candidate);
      if (a.width !== b.width || a.height !== b.height)
        throw Error("Phosphor dimensions mismatch.");
      const levels = new Set<number>(),
        rgb = [0, 0, 0],
        rows: number[] = [];
      let alphaMax = 0,
        opaqueMax = 0,
        opaqueTotal = 0,
        opaque = 0,
        different = 0,
        hash = 2166136261;
      for (let y = 0; y < b.height; y++) {
        let row = 0;
        for (let x = 0; x < b.width; x++) {
          const i = (y * b.width + x) * 4;
          levels.add(b.data[i + 3]!);
          row += b.data[i]!;
          alphaMax = Math.max(alphaMax, Math.abs(a.data[i + 3]! - b.data[i + 3]!));
          for (let c = 0; c < 4; c++) {
            const error = Math.abs(a.data[i + c]! - b.data[i + c]!);
            different += Number(error !== 0);
            hash = Math.imul(hash ^ b.data[i + c]!, 16777619);
            if (c < 3 && a.data[i + 3] === 255 && b.data[i + 3] === 255) {
              opaqueMax = Math.max(opaqueMax, error);
              opaqueTotal += error;
              rgb[c] = rgb[c]! + b.data[i + c]!;
              if (c === 0) opaque++;
            }
          }
        }
        rows.push(row / b.width);
      }
      const sample = (x: number, y: number) =>
        Array.from(b.data.slice((y * b.width + x) * 4, (y * b.width + x) * 4 + 4));
      return {
        size: [b.width, b.height],
        alphaMax,
        alphaLevels: levels.size,
        opaqueMax,
        opaqueMean: opaqueTotal / Math.max(1, opaque * 3),
        mean: rgb.map((value) => value / Math.max(1, opaque)),
        rowRange: Math.max(...rows) - Math.min(...rows),
        different,
        hash: hash >>> 0,
        probes: { shadow: sample(20, 64), halo: sample(54, 64), core: sample(64, 64) },
      };
    },
    { baseline, candidate },
  );
}
async function ready(page: Page, projectId: string, previous: number, scale?: number) {
  await page.waitForFunction(
    ({ projectId, previous, scale }) => {
      const d = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
      return (
        d?.projectId === projectId &&
        d.rendererReady === "true" &&
        d.sceneRevision === d.renderedRevision &&
        Number(d.sceneRevision) > previous &&
        (scale === undefined || Number(d.renderWidth) === 128 * scale)
      );
    },
    { projectId, previous, scale },
  );
}
for (const forceWebGL of [false, true])
  test(`Pink Phosphor: photographic emission, glow hierarchy, source alpha, phase and fractional export (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
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
    const inspector = await page.context().newPage();
    const sources = await inspector.evaluate(
      async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const context = canvas.getContext("2d")!;
        context.save();
        context.beginPath();
        context.roundRect(0, 0, 128, 128, 12);
        context.clip();
        context.drawImage(image, 0, 0, 128, 128);
        context.globalCompositeOperation = "destination-in";
        const alpha = context.createLinearGradient(0, 0, 0, 128);
        alpha.addColorStop(0, "white");
        alpha.addColorStop(0.5, "white");
        alpha.addColorStop(1, "#ffffff40");
        context.fillStyle = alpha;
        context.fillRect(0, 0, 128, 128);
        context.restore();
        const photo = canvas.toDataURL("image/png");
        context.fillStyle = "#808080";
        context.fillRect(0, 0, 128, 128);
        const flat = canvas.toDataURL("image/png");
        context.fillStyle = "black";
        context.fillRect(0, 0, 128, 128);
        context.fillStyle = "white";
        context.fillRect(56, 16, 16, 96);
        const bright = canvas.toDataURL("image/png");
        context.clearRect(0, 0, 128, 128);
        context.fillRect(56, 16, 16, 96);
        return { photo, flat, bright, cutout: canvas.toDataURL("image/png") };
      },
      `data:image/jpeg;base64,${(await readFile("apps/web/public/benchmark/50-waterfall-5.jpg")).toString("base64")}`,
    );
    await page.bringToFront();
    const key = forceWebGL ? "webgl" : "webgpu",
      base = createEffect("pink-phosphor", { seed: 0 });
    await mkdir("artifacts/pink-phosphor", { recursive: true });
    const images: Record<string, string> = {},
      witnesses: Record<string, Awaited<ReturnType<typeof pixels>>> = {};
    const save = async (name: string, url: string) => {
      images[name] = url;
      await writeFile(
        `artifacts/pink-phosphor/${key}-${name}.png`,
        Buffer.from(url.split(",")[1]!, "base64"),
      );
    };
    let currentId = "";
    const load = async (effect: Effect | null, kind: keyof typeof sources = "photo") => {
      currentId = `pink-phosphor-${key}-${kind}`;
      const project = createProject({
        id: currentId,
        assets: {
          source: {
            id: "source",
            name: kind,
            mime: "image/png",
            width: 128,
            height: 128,
            dataUrl: sources[kind],
          },
        },
        pages: [
          createPage({
            id: "pink-page",
            width: 128,
            height: 128,
            background: "transparent",
            layers: [
              createLayer("image", {
                id: "pink-image",
                assetId: "source",
                x: 0,
                y: 0,
                width: 128,
                height: 128,
                effects: effect ? [effect] : [],
              }),
            ],
          }),
        ],
      });
      const previous = await page.evaluate((project) => {
        const previous = Number(
          document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
            .sceneRevision ?? 0,
        );
        window.musart!.load(project);
        window.musart!.select(["pink-image"]);
        return previous;
      }, project);
      await ready(page, currentId, previous);
    };
    const png = (scale = 1) =>
      page.evaluate((options) => window.musart!.render(options), {
        format: "png" as const,
        forceWebGL,
        scale,
      });
    try {
      await load(null);
      const photo = await png();
      await save("photo", photo);
      await load(base);
      const pink = await png();
      await save("pink", pink);
      const witness = await pixels(inspector, photo, pink);
      witnesses.photo = witness;
      expect(witness.alphaMax).toBe(0);
      expect(witness.alphaLevels).toBeGreaterThan(32);
      expect(witness.opaqueMean).toBeGreaterThan(10);
      expect(witness.mean[0]! - witness.mean[1]!).toBeGreaterThan(20);
      expect(witness.mean[2]! - witness.mean[1]!).toBeGreaterThan(10);
      expect((await pixels(inspector, pink, await png())).different).toBe(0);
      await load({ ...base, time: 0.25 });
      const moving = await png();
      await save("phase", moving);
      witnesses.phase = await pixels(inspector, pink, moving);
      expect(witnesses.phase.alphaMax).toBe(0);
      expect(witnesses.phase.opaqueMean).toBeGreaterThan(0.2);
      await load({ ...base, seed: 191 });
      witnesses.seed = await pixels(inspector, pink, await png());
      expect(witnesses.seed.opaqueMean).toBeGreaterThan(0.1);
      await load({ ...base, settings: { ...base.settings, speed: 0 } });
      const stationary = await png();
      await load({ ...base, time: 86400, settings: { ...base.settings, speed: 0 } });
      expect((await pixels(inspector, stationary, await png())).different).toBe(0);
      await load({ ...base, amount: 0 });
      witnesses.zero = await pixels(inspector, photo, await png());
      expect(witnesses.zero.alphaMax).toBe(0);
      expect(witnesses.zero.opaqueMax).toBeLessThanOrEqual(1);
      await load({
        ...base,
        settings: {
          ...base.settings,
          background: "#001109",
          phosphor: "#00ff66",
          highlight: "#e8fff2",
        },
      });
      const green = await png();
      await save("palette", green);
      witnesses.palette = await pixels(inspector, photo, green);
      expect(witnesses.palette.mean[1]! - witnesses.palette.mean[0]!).toBeGreaterThan(20);
      expect(witnesses.palette.alphaMax).toBe(0);
      await load({ ...base, settings: { ...base.settings, gamma: 0.5, exposure: 1, contrast: 2 } });
      witnesses.transfer = await pixels(inspector, pink, await png());
      expect(witnesses.transfer.opaqueMean).toBeGreaterThan(5);
      const quiet = { ...base.settings, grain: 0, flicker: 0, glow: 0, scanlines: 0 };
      await load({ ...base, settings: quiet }, "flat");
      const smooth = await png();
      await save("flat", smooth);
      expect((await pixels(inspector, smooth, smooth)).rowRange).toBe(0);
      await load({ ...base, settings: { ...quiet, scanlines: 1 } }, "flat");
      const scanned = await png();
      await save("scanlines", scanned);
      witnesses.scanlines = await pixels(inspector, smooth, scanned);
      expect(witnesses.scanlines.rowRange).toBeGreaterThan(50);
      await load({ ...base, settings: quiet }, "bright");
      const noGlow = await png();
      await save("no-glow", noGlow);
      await load({ ...base, settings: { ...quiet, glow: 0.8, glowThreshold: 0.5 } }, "bright");
      const bloom = await png();
      await save("glow", bloom);
      witnesses.glow = await pixels(inspector, noGlow, bloom);
      expect(witnesses.glow.probes.halo[0]! - witnesses.glow.probes.shadow[0]!).toBeGreaterThan(20);
      expect(witnesses.glow.probes.core[0]!).toBeGreaterThan(witnesses.glow.probes.halo[0]!);
      expect(witnesses.glow.probes.halo[0]!).toBeGreaterThan(witnesses.glow.probes.halo[1]!);
      await load(
        { ...base, settings: { ...quiet, glow: 2, glowRadius: 32, glowThreshold: 1 } },
        "bright",
      );
      expect((await pixels(inspector, noGlow, await png())).different).toBe(0);
      await load(null, "cutout");
      const silhouette = await png();
      await load({ ...base, settings: { ...quiet, glow: 2, glowThreshold: 0 } }, "cutout");
      witnesses.cutout = await pixels(inspector, silhouette, await png());
      expect(witnesses.cutout.alphaMax).toBe(0);
      expect(witnesses.cutout.probes.halo[3]).toBe(0);
      await load({
        ...base,
        time: 0.3,
        settings: {
          ...base.settings,
          glow: 2,
          glowRadius: 32,
          glowThreshold: 0,
          scanlines: 1,
          beamWidth: 0.1,
          grain: 0.5,
          flicker: 0.3,
          speed: 8,
          gamma: 0.1,
          exposure: 4,
          contrast: 4,
        },
      });
      const extreme = await png();
      await save("extreme", extreme);
      witnesses.extreme = await pixels(inspector, photo, extreme);
      expect(witnesses.extreme.alphaMax).toBe(0);
      await load(base);
      const densities = [];
      for (const [zoom, scale] of [
        [0.5, 0.625],
        [0.8, 1],
        [1.2, 2],
      ] as const) {
        await page.getByTestId("artboard").hover();
        await zoomViewport(page, zoom);
        await ready(page, currentId, -1, scale);
        const live = forceWebGL
          ? (await nativeWebGLFrame(page, currentId)).dataUrl
          : await page
              .locator(".editor-gpu-scene canvas")
              .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));
        const metrics = await pixels(inspector, await png(scale), live);
        expect(metrics.size).toEqual([128 * scale, 128 * scale]);
        expect(metrics.different).toBe(0);
        densities.push({ zoom, physicalDensity: zoom * 1.25, backingScale: scale, metrics });
      }
      const sheet = await inspector.evaluate(async (entries) => {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 444;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#363636";
        context.fillRect(0, 0, 512, 444);
        for (const [i, [name, url]] of entries.entries()) {
          const image = new Image();
          image.src = url;
          await image.decode();
          const x = (i % 4) * 128,
            y = Math.floor(i / 4) * 148;
          context.drawImage(image, x, y);
          context.fillStyle = "white";
          context.font = "12px sans-serif";
          context.fillText(name, x + 4, y + 143);
        }
        return canvas.toDataURL("image/png");
      }, Object.entries(images));
      await save("contact-sheet", sheet);
      const environment = await densityEnvironment(page);
      expect(environment.backend).toBe(key);
      expect(environment.dpr).toBe(1.25);
      expect(errors).toEqual([]);
      expect({
        gpu: environment.reads.gpu,
        webgl: environment.reads.webgl,
        canvas: environment.reads.canvas,
      }).toEqual({ gpu: 0, webgl: 0, canvas: 0 });
      await writeFile(
        `artifacts/pink-phosphor/${key}.json`,
        JSON.stringify(
          {
            boundary:
              "Real photo/partial alpha; explicit-phase deterministic artistic emission; source silhouette retained; scanline and bright-source glow witnesses. Visual primary reference: Three r186 official bloom screenshot (core/halo/dark hierarchy), not a pixel-identical implementation or calibrated phosphor/afterglow simulation. Exact native editor/export at matched backing density; validation reads isolated.",
            witnesses,
            densities,
            environment,
            errors,
          },
          null,
          2,
        ),
      );
    } finally {
      if (forceWebGL) await page.evaluate(() => window.__stopLiveWebGLSnapshot?.());
      await inspector.close();
    }
  });
