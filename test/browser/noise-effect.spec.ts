import { expect, test, type Page } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject, type Effect } from "@musart/core";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { installWebGLFrameSnapshot, nativeWebGLFrame } from "./support/webgl-frame-snapshot";
import { densityEnvironment } from "./support/effect-density";
import { zoomViewport } from "./support/viewport";
import type { NoisePrimaryOptions } from "./support/noise-primary-reference";

test.use({ deviceScaleFactor: 1.25 });
let referenceBundle = "";
test.beforeAll(async () => {
  // Build the validation-only upstream reference before any measured GPU frame.
  await promisify(execFile)("bun", [
    "build",
    "test/browser/support/noise-primary-reference.ts",
    "--target=browser",
    "--format=esm",
    "--outdir=artifacts/noise-primary-reference",
  ]);
  referenceBundle = await readFile(
    "artifacts/noise-primary-reference/noise-primary-reference.js",
    "utf8",
  );
});
async function compare(page: Page, a: string, b: string) {
  return page.evaluate(
    async ({ a, b }) => {
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
      const first = await decode(a),
        second = await decode(b);
      if (first.width !== second.width || first.height !== second.height)
        throw Error("Mismatched noise comparison dimensions.");
      const levels = new Set<number>(),
        colors = new Set<string>();
      let alphaMax = 0,
        maxByte = 0,
        different = 0,
        opaqueMax = 0,
        opaqueError = 0,
        opaqueCount = 0,
        colorDistance = 0,
        low = 255,
        high = 0,
        transparent = 0,
        hash = 2166136261;
      for (let i = 0; i < first.data.length; i += 4) {
        levels.add(second.data[i + 3]!);
        if (second.data[i + 3] === 0) transparent++;
        alphaMax = Math.max(alphaMax, Math.abs(first.data[i + 3]! - second.data[i + 3]!));
        if (second.data[i + 3]! > 250) {
          colors.add(`${second.data[i]},${second.data[i + 1]},${second.data[i + 2]}`);
          colorDistance +=
            Math.abs(second.data[i]! - second.data[i + 1]!) +
            Math.abs(second.data[i + 1]! - second.data[i + 2]!);
          low = Math.min(low, second.data[i]!);
          high = Math.max(high, second.data[i]!);
        }
        for (let c = 0; c < 4; c++) {
          const error = Math.abs(first.data[i + c]! - second.data[i + c]!);
          different += Number(error !== 0);
          maxByte = Math.max(maxByte, error);
          hash = Math.imul(hash ^ second.data[i + c]!, 16777619);
          if (c < 3 && first.data[i + 3]! > 250 && second.data[i + 3]! > 250) {
            opaqueMax = Math.max(opaqueMax, error);
            opaqueError += error;
            opaqueCount++;
          }
        }
      }
      return {
        size: [second.width, second.height],
        alphaMax,
        maxByte,
        different,
        opaqueMax,
        opaqueMean: opaqueError / Math.max(1, opaqueCount),
        alphaLevels: levels.size,
        colors: colors.size,
        colorDistance,
        range: high - low,
        transparent,
        hash: hash >>> 0,
      };
    },
    { a, b },
  );
}
async function ready(page: Page, projectId: string, previous: number, physicalScale?: number) {
  await page.waitForFunction(
    ({ projectId, previous, physicalScale }) => {
      const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
      return (
        data?.projectId === projectId &&
        data.rendererReady === "true" &&
        data.sceneRevision === data.renderedRevision &&
        Number(data.sceneRevision) > previous &&
        (physicalScale === undefined ||
          Number(data.renderWidth) === Math.round(128 * physicalScale))
      );
    },
    { projectId, previous, physicalScale },
  );
}

for (const forceWebGL of [false, true])
  test(`Noise: seven real 3D fields, upstream primitives, source alpha and exact fractional-density export (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(180000);
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
    // A blank page has no secure origin and silently falls back to WebGL. Give
    // the isolated oracle an actual localhost origin without booting a second app.
    await inspection.route("**/noise-primary-inspection", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><meta charset=utf-8>" }),
    );
    await inspection.goto("/noise-primary-inspection");
    await inspection.addScriptTag({ type: "module", content: referenceBundle });
    await inspection.waitForFunction(() => Boolean(window.__noisePrimaryReference));
    const source = await inspection.evaluate(
      async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const context = canvas.getContext("2d")!;
        context.beginPath();
        context.roundRect(0, 0, 128, 128, 12);
        context.clip();
        context.drawImage(image, 0, 0, 128, 128);
        context.globalCompositeOperation = "destination-in";
        const alpha = context.createLinearGradient(0, 0, 0, 128);
        alpha.addColorStop(0, "#ffffffff");
        alpha.addColorStop(0.5, "#ffffffff");
        alpha.addColorStop(1, "#ffffff40");
        context.fillStyle = alpha;
        context.fillRect(0, 0, 128, 128);
        return canvas.toDataURL("image/png");
      },
      `data:image/jpeg;base64,${(await readFile("apps/web/public/benchmark/50-waterfall-5.jpg")).toString("base64")}`,
    );
    await page.bringToFront();
    const projectId = `noise-native-${forceWebGL ? "webgl" : "webgpu"}`,
      key = forceWebGL ? "webgl" : "webgpu";
    await mkdir("artifacts/noise", { recursive: true });
    const saved: Record<string, string> = {},
      save = async (name: string, url: string) => {
        saved[name] = url;
        await writeFile(
          `artifacts/noise/${key}-${name}.png`,
          Buffer.from(url.split(",")[1]!, "base64"),
        );
      };
    const base = createEffect("noise", {
      seed: 0,
      scale: 16,
      time: 0,
      settings: { offsetZ: 0.375 },
    });
    const load = async (effect: Effect | null) => {
      const project = createProject({
        id: projectId,
        name: "Noise native photo",
        assets: {
          photo: {
            id: "photo",
            name: "Waterfall with fractional alpha",
            mime: "image/png",
            width: 128,
            height: 128,
            dataUrl: source,
          },
        },
        pages: [
          createPage({
            id: "noise-page",
            width: 128,
            height: 128,
            background: "transparent",
            layers: [
              createLayer("image", {
                id: "noise-image",
                assetId: "photo",
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
        const before = Number(
          document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
            .sceneRevision ?? 0,
        );
        window.musart!.load(project);
        window.musart!.select(["noise-image"]);
        return before;
      }, project);
      await ready(page, projectId, previous);
    };
    const png = (scale = 1) =>
      page.evaluate((options) => window.musart!.render(options), {
        format: "png" as const,
        scale,
        forceWebGL,
      });
    try {
      await load(null);
      const photograph = await png();
      await save("photo", photograph);
      const algorithms = [
          "perlin",
          "value",
          "cell",
          "worley",
          "fbm",
          "ridged",
          "turbulence",
        ] as const,
        witnesses: Record<string, Awaited<ReturnType<typeof compare>>> = {},
        hashes = new Set<number>();
      for (const algorithm of algorithms) {
        await load({ ...base, settings: { ...base.settings, algorithm } });
        const image = await png();
        await save(algorithm, image);
        const witness = await compare(inspection, photograph, image);
        witnesses[algorithm] = witness;
        hashes.add(witness.hash);
        expect(witness.alphaMax, algorithm).toBe(0);
        expect(witness.alphaLevels, algorithm).toBeGreaterThan(32);
        expect(witness.transparent, algorithm).toBeGreaterThan(0);
        expect(witness.colors, algorithm).toBeGreaterThan(8);
        expect(witness.range, algorithm).toBeGreaterThan(20);
        expect((await compare(inspection, image, await png())).different, algorithm).toBe(0);
      }
      expect(hashes.size).toBe(7);
      const references: Record<string, unknown> = {};
      for (const algorithm of ["perlin", "cell", "worley", "fbm"] as const) {
        const reference = await inspection.evaluate(
          (options) => window.__noisePrimaryReference!(options),
          { algorithm, forceWebGL } satisfies NoisePrimaryOptions,
        );
        expect(reference.backend).toBe(key);
        await save(`upstream-${algorithm}`, reference.dataUrl);
        const metrics = await compare(inspection, reference.dataUrl, saved[algorithm]!);
        expect(metrics.opaqueMax, algorithm).toBeLessThanOrEqual(2);
        expect(metrics.opaqueMean, algorithm).toBeLessThan(0.5);
        references[algorithm] = metrics;
      }
      await page.bringToFront();
      await load({ ...base, seed: 1234 });
      const seeded = await png();
      const seedMetrics = await compare(inspection, saved.perlin!, seeded);
      expect(seedMetrics.opaqueMean).toBeGreaterThan(2);
      expect(seedMetrics.alphaMax).toBe(0);
      await load({ ...base, time: 1.25 });
      const timeMetrics = await compare(inspection, saved.perlin!, await png());
      expect(timeMetrics.opaqueMean).toBeGreaterThan(1);
      expect(timeMetrics.alphaMax).toBe(0);
      await load({ ...base, settings: { ...base.settings, speed: 0 } });
      const still = await png();
      await load({ ...base, time: 86400, settings: { ...base.settings, speed: 0 } });
      expect((await compare(inspection, still, await png())).different).toBe(0);
      await load({ ...base, amount: 0 });
      const zero = await compare(inspection, photograph, await png());
      expect(zero.alphaMax).toBe(0);
      expect(zero.opaqueMax).toBeLessThanOrEqual(1);
      await load({ ...base, color: true });
      const colored = await png();
      await save("colored", colored);
      const colorMetrics = await compare(inspection, photograph, colored);
      expect(colorMetrics.alphaMax).toBe(0);
      expect(colorMetrics.colorDistance).toBeGreaterThan(1000);
      const densities: unknown[] = [];
      // Physical density below 1x is exact; magnification uses the retained
      // renderer's documented power-of-two quality tier (1.5x requests 2x).
      for (const [zoom, scale] of [
        [0.5, 0.625],
        [0.8, 1],
        [1.2, 2],
      ] as const) {
        await page.getByTestId("artboard").hover();
        await zoomViewport(page, zoom);
        await ready(page, projectId, -1, scale);
        const live = forceWebGL
            ? (await nativeWebGLFrame(page, projectId)).dataUrl
            : await page
                .locator(".editor-gpu-scene canvas")
                .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png")),
          exported = await png(scale),
          metrics = await compare(inspection, exported, live);
        expect(metrics.size).toEqual([Math.round(128 * scale), Math.round(128 * scale)]);
        expect(metrics.different).toBe(0);
        densities.push({ zoom, physicalDensity: zoom * 1.25, backingScale: scale, metrics });
        await save(`live-${zoom}`, live);
        await save(`export-${zoom}`, exported);
      }
      const sheet = await inspection.evaluate(
        async (images) => {
          const canvas = document.createElement("canvas");
          canvas.width = 512;
          canvas.height = 444;
          const context = canvas.getContext("2d")!;
          context.fillStyle = "#363636";
          context.fillRect(0, 0, 512, 444);
          let at = 0;
          for (const [name, src] of images) {
            const image = new Image();
            image.src = src;
            await image.decode();
            const x = (at % 4) * 128,
              y = Math.floor(at / 4) * 148;
            context.drawImage(image, x, y, 128, 128);
            context.fillStyle = "white";
            context.font = "12px sans-serif";
            context.fillText(name, x + 4, y + 143);
            at++;
          }
          return canvas.toDataURL("image/png");
        },
        Object.entries(saved).filter(
          ([name]) =>
            name === "photo" ||
            algorithms.includes(name as (typeof algorithms)[number]) ||
            name.startsWith("upstream-"),
        ),
      );
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
        `artifacts/noise/${key}.json`,
        JSON.stringify(
          {
            boundary:
              "Actual photo alpha; seven distinct deterministic GPU fields; independent direct upstream MaterialX references on opaque pixels for Perlin/cell/Worley/fBm; no independent primary pixel oracle claimed for value/ridged/turbulence; genuine editor-vs-export RGBA at matched fractional physical densities. Reference/inspection page is outside production readback probes.",
            witnesses,
            references,
            seedMetrics,
            timeMetrics,
            zero,
            colorMetrics,
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
      await inspection.evaluate(() => window.__disposeNoisePrimary?.());
      await inspection.close();
    }
  });
