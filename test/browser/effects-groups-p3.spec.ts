import { expect, test, type Page } from "@playwright/test";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  type Effect,
  type EffectType,
} from "@musart/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { installWebGLFrameSnapshot, nativeWebGLFrame } from "./support/webgl-frame-snapshot";
import { densityEnvironment } from "./support/effect-density";
import { zoomViewport } from "./support/viewport";

test.use({ deviceScaleFactor: 1.25 });
const cases: readonly [EffectType, Partial<Effect>][] = [
  [
    "ripple",
    {
      time: 0.35,
      settings: {
        centerX: 0.45,
        centerY: 0.45,
        innerRadius: 8,
        radius: 46,
        feather: 6,
        amplitude: 5,
        wavelength: 14,
        speed: 24,
      },
    },
  ],
  [
    "shatter",
    {
      scale: 20,
      settings: { radius: 1.5, innerRadius: 0, tilt: 0.3, displacement: 4, thickness: 12 },
    },
  ],
  ["noise", { amount: 0.7, scale: 12, seed: 21, time: 0.2, settings: { algorithm: "fbm" } }],
  [
    "flashlight",
    {
      settings: {
        centerX: 0.45,
        centerY: 0.5,
        radius: 0.55,
        intensity: 1.7,
        ambient: 0.12,
        grain: 0,
      },
    },
  ],
  ["circle", { settings: { spacing: 7, dotSize: 0.9, softness: 0.5 } }],
  ["cyanotype", {}],
  [
    "datamosh",
    {
      amount: 0.85,
      levels: 12,
      time: 0.5,
      settings: { blockSize: 12, displacement: 9, chromaShift: 2, density: 1, smear: 0.7 },
    },
  ],
  [
    "crt",
    { scale: 3, settings: { scanlinePitch: 3, curvatureX: 0.15, curvatureY: 0.12, glow: 0.08 } },
  ],
  ["bit-dither", { scale: 2 }],
  ["receipt", { scale: 2, settings: { marginX: 0.05, marginY: 0.05, edgeHeight: 2 } }],
  ["pink-phosphor", { time: 0.3 }],
];
async function compare(inspector: Page, a: string, b: string) {
  return inspector.evaluate(
    async ({ a, b }) => {
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
          pixels: context.getImageData(0, 0, image.width, image.height).data,
        };
      };
      const first = await decode(a),
        second = await decode(b);
      if (first.width !== second.width || first.height !== second.height)
        throw Error("Group matrix dimensions differ.");
      let alphaMax = 0,
        coveredChanged = 0,
        total = 0,
        different = 0,
        coverage = 0;
      const levels = new Set<number>();
      for (let i = 0; i < first.pixels.length; i += 4) {
        const aa = first.pixels[i + 3]!,
          ba = second.pixels[i + 3]!;
        alphaMax = Math.max(alphaMax, Math.abs(aa - ba));
        levels.add(ba);
        coverage += ba;
        let error = 0;
        for (let c = 0; c < 4; c++) {
          different += Number(first.pixels[i + c] !== second.pixels[i + c]);
          if (c < 3)
            error += Math.abs(
              (first.pixels[i + c]! * aa) / 255 - (second.pixels[i + c]! * ba) / 255,
            );
        }
        total += error;
        if (Math.min(aa, ba) > 16 && error > 1) coveredChanged++;
      }
      return {
        size: [second.width, second.height],
        alphaMax,
        alphaLevels: levels.size,
        coveredChanged,
        premultipliedMean: total / (first.width * first.height * 3),
        different,
        coverage,
      };
    },
    { a, b },
  );
}
for (const forceWebGL of [false, true])
  test(`all eleven effects: transformed nested groups, real layer mask and Display-P3 working composition (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(240000);
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
    const source = await inspector.evaluate(
      async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 112;
        canvas.height = 96;
        const context = canvas.getContext("2d")!;
        context.save();
        context.beginPath();
        context.roundRect(0, 0, 112, 96, 9);
        context.clip();
        context.drawImage(image, 0, 0, 112, 96);
        context.globalCompositeOperation = "destination-in";
        const alpha = context.createLinearGradient(0, 0, 0, 96);
        alpha.addColorStop(0, "white");
        alpha.addColorStop(0.4, "white");
        alpha.addColorStop(1, "#ffffff60");
        context.fillStyle = alpha;
        context.fillRect(0, 0, 112, 96);
        context.restore();
        return canvas.toDataURL("image/png");
      },
      `data:image/jpeg;base64,${(await readFile("apps/web/public/benchmark/50-waterfall-5.jpg")).toString("base64")}`,
    );
    await page.bringToFront();
    const key = forceWebGL ? "webgl" : "webgpu";
    await mkdir("artifacts/effects-groups-p3", { recursive: true });
    const reports: unknown[] = [],
      images: [string, string][] = [];
    let currentId = "";
    const load = async (effect: Effect, masked = true) => {
      currentId = `groups-p3-${key}-${effect.type}-${masked ? "mask" : "open"}`;
      const outer = createLayer("group", {
          id: "outer",
          x: 14,
          y: 10,
          width: 160,
          height: 140,
          rotation: -7,
          opacity: 0.9,
        }),
        target = createLayer("group", {
          id: "target",
          parentId: outer.id,
          x: 20,
          y: 18,
          width: 112,
          height: 96,
          rotation: 13,
          effects: [effect],
          mask: masked
            ? { layerId: "real-mask", mode: "alpha", enabled: true, inverted: false }
            : null,
        });
      const project = createProject({
        id: currentId,
        assets: {
          photo: {
            id: "photo",
            name: "waterfall",
            mime: "image/png",
            width: 112,
            height: 96,
            dataUrl: source,
          },
        },
        pages: [
          createPage({
            id: "matrix-page",
            width: 192,
            height: 160,
            colorSpace: "display-p3",
            background: "transparent",
            layers: [
              outer,
              target,
              createLayer("image", {
                id: "photo-layer",
                parentId: target.id,
                x: 0,
                y: 0,
                width: 112,
                height: 96,
                assetId: "photo",
              }),
              createLayer("ellipse", {
                id: "glaze",
                parentId: target.id,
                x: 18,
                y: 12,
                width: 40,
                height: 32,
                fill: "#ef334f",
                opacity: 0.4,
                blendMode: "screen",
              }),
              createLayer("ellipse", {
                id: "real-mask",
                parentId: outer.id,
                x: 18,
                y: 16,
                width: 105,
                height: 85,
                rotation: -11,
                opacity: 0.8,
                fill: "#ffffff",
                maskSource: true,
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
        return previous;
      }, project);
      await ready(previous);
      expect(
        await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.colorSpace),
      ).toBe("display-p3");
    };
    const ready = async (previous: number, scale?: number) => {
      await page.waitForFunction(
        ({ currentId, previous, scale }) => {
          const d = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
          return (
            d?.projectId === currentId &&
            d.rendererReady === "true" &&
            d.sceneRevision === d.renderedRevision &&
            Number(d.sceneRevision) > previous &&
            (scale === undefined || Number(d.renderWidth) === 192 * scale)
          );
        },
        { currentId, previous, scale },
      );
    };
    const png = (scale = 1) =>
      page.evaluate((options) => window.musart!.render(options), {
        format: "png" as const,
        forceWebGL,
        scale,
      });
    try {
      for (const [type, patch] of cases) {
        const effect = createEffect(type, patch),
          neutral = { ...effect, amount: 0 };
        await load(neutral);
        const baseline = await png();
        await load(neutral, false);
        const unmasked = await png();
        const mask = await compare(inspector, baseline, unmasked);
        const maskedCoverage = (await compare(inspector, baseline, baseline)).coverage;
        expect(mask.coverage, type).toBeGreaterThan(maskedCoverage * 1.1);
        await load(effect);
        const image = await png(),
          witness = await compare(inspector, baseline, image);
        expect(witness.alphaMax, type).toBe(0);
        expect(witness.alphaLevels, type).toBeGreaterThan(16);
        expect(witness.coveredChanged, type).toBeGreaterThan(100);
        expect(witness.premultipliedMean, type).toBeGreaterThan(0.5);
        expect((await compare(inspector, image, await png())).different, type).toBe(0);
        await writeFile(
          `artifacts/effects-groups-p3/${key}-${type}.png`,
          Buffer.from(image.split(",")[1]!, "base64"),
        );
        images.push([type, image]);
        const densities = [];
        for (const [zoom, scale] of [
          [0.5, 0.625],
          [0.8, 1],
          [1.2, 2],
        ] as const) {
          await page.getByTestId("artboard").hover();
          await zoomViewport(page, zoom);
          await ready(-1, scale);
          const live = forceWebGL
            ? (await nativeWebGLFrame(page, currentId)).dataUrl
            : await page
                .locator(".editor-gpu-scene canvas")
                .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));
          const equality = await compare(inspector, await png(scale), live);
          expect(equality.size, type).toEqual([192 * scale, 160 * scale]);
          expect(equality.different, `${type} ${scale}x`).toBe(0);
          densities.push({ zoom, physicalDensity: zoom * 1.25, backingScale: scale, equality });
        }
        reports.push({
          type,
          witness,
          mask: { maskedCoverage, unmaskedCoverage: mask.coverage },
          densities,
        });
      }
      const sheet = await inspector.evaluate(async (images) => {
        const canvas = document.createElement("canvas");
        canvas.width = 768;
        canvas.height = 540;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#363636";
        context.fillRect(0, 0, 768, 540);
        for (const [i, [name, url]] of images.entries()) {
          const image = new Image();
          image.src = url;
          await image.decode();
          const x = (i % 4) * 192,
            y = Math.floor(i / 4) * 180;
          context.drawImage(image, x, y);
          context.fillStyle = "white";
          context.font = "12px sans-serif";
          context.fillText(name, x + 4, y + 174);
        }
        return canvas.toDataURL("image/png");
      }, images);
      await writeFile(
        `artifacts/effects-groups-p3/${key}-contact-sheet.png`,
        Buffer.from(sheet.split(",")[1]!, "base64"),
      );
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
        `artifacts/effects-groups-p3/${key}.json`,
        JSON.stringify(
          {
            boundary:
              "Eleven actual GPU effects in a Display-P3 working composition, converted by the common presentation pipeline to native sRGB output. Two nested rotated groups, fractional source/parent opacity, separate rotated layer mask; amount-zero retains identical reference geometry; non-noop and mask-coverage witnesses; exact same-backing editor/export RGBA. No claim of wide-gamut PNG tagging or equality to a full-page 1x CPU resize.",
            reports,
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
