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
async function load(page: Page, project: Project, scale = 1) {
  await page.evaluate((project) => window.musart!.load(project), project);
  await ready(page, project.id, project.pages[0]!.width * scale);
}
async function ready(page: Page, projectId: string, width: number) {
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
async function inspect(inspection: Page, reference: string, candidate: string, enlarge = 1) {
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
          pixels: context.getImageData(0, 0, image.width, image.height).data,
        };
      };
      const a = await decode(reference),
        b = await decode(candidate);
      let differentBytes = 0,
        alphaMax = 0,
        expansionMax = 0,
        rgbError = 0,
        samples = 0,
        ink = 0,
        paper = 0,
        alphaMinimum = 255,
        alphaMaximum = 0;
      const alphaLevels = new Set<number>();
      for (let y = 0; y < a.height; y++)
        for (let x = 0; x < a.width; x++) {
          const i = (y * a.width + x) * 4;
          for (let dy = 0; dy < enlarge; dy++)
            for (let dx = 0; dx < enlarge; dx++) {
              const j = ((y * enlarge + dy) * b.width + x * enlarge + dx) * 4;
              for (let c = 0; c < 4; c++) {
                const error = Math.abs(a.pixels[i + c]! - b.pixels[j + c]!);
                differentBytes += Number(error !== 0);
                if (c === 3) {
                  alphaMax = Math.max(alphaMax, error);
                  expansionMax = Math.max(expansionMax, b.pixels[j + c]! - a.pixels[i + c]!);
                } else rgbError += error;
              }
              samples++;
            }
        }
      for (let i = 0; i < b.pixels.length; i += 4) {
        const alpha = b.pixels[i + 3]!;
        alphaLevels.add(alpha);
        alphaMinimum = Math.min(alphaMinimum, alpha);
        alphaMaximum = Math.max(alphaMaximum, alpha);
        if (alpha > 250) {
          const color = [b.pixels[i]!, b.pixels[i + 1]!, b.pixels[i + 2]!];
          if (color.every((value, c) => Math.abs(value - [16, 48, 80][c]!) <= 2)) ink++;
          if (color.every((value, c) => Math.abs(value - [255, 244, 210][c]!) <= 2)) paper++;
        }
      }
      return {
        reference: [a.width, a.height],
        candidate: [b.width, b.height],
        differentBytes,
        alphaMax,
        expansionMax,
        rgbMean: rgbError / (samples * 3),
        alphaLevels: alphaLevels.size,
        alphaMinimum,
        alphaMaximum,
        ink,
        paper,
      };
    },
    { reference, candidate, enlarge },
  );
}
async function cells(inspection: Page, image: string) {
  return inspection.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, image.width, image.height).data;
    const result = [16, 80, 144].map((left) => {
      let ink = 0,
        intermediate = 0,
        alpha = 0;
      for (let y = 16; y < 32; y++)
        for (let x = left; x < left + 16; x++) {
          const i = (y * image.width + x) * 4;
          ink += Number(data[i]! < 10);
          intermediate += Number(data[i]! >= 10 && data[i]! <= 245);
          alpha += data[i + 3]!;
        }
      return { ink, intermediate, alphaMean: alpha / 256 };
    });
    const pixel = (x: number, y: number) =>
      Array.from(data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));
    return { cells: result, grayCenter: pixel(88, 24), grayCorner: pixel(80, 16) };
  }, image);
}
function flat(effect: Effect) {
  const group = createLayer("group", {
    id: "circle-flat-group",
    x: 0,
    y: 0,
    width: 192,
    height: 64,
    effects: [effect],
  });
  return createProject({
    pages: [
      createPage({
        id: "circle-flat-page",
        width: 192,
        height: 64,
        background: "transparent",
        layers: [
          group,
          ...["#ffffff", "#808080", "#000000"].map((fill, index) =>
            createLayer("rectangle", {
              parentId: group.id,
              x: index * 64,
              y: 0,
              width: 64,
              height: 64,
              fill,
            }),
          ),
        ],
      }),
    ],
  });
}
const flatSettings = {
  spacing: 16,
  rotation: 0,
  dotSize: 1,
  softness: 0,
  gamma: 1,
  polarity: "shadows",
  foreground: "#000000",
  background: "#ffffff",
  foregroundOpacity: 1,
  backgroundOpacity: 1,
};

for (const forceWebGL of [false, true])
  test(`Circle: photographic circular screen, luminance radius, color/coverage and exact zoom/export (${forceWebGL ? "WebGL fallback" : "WebGPU"})`, async ({
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
    await mkdir("artifacts/circle", { recursive: true });
    const save = (name: string, url: string) =>
      writeFile(`artifacts/circle/${key}-${name}.png`, Buffer.from(url.split(",")[1]!, "base64"));
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
          return {
            originalSize: [image.naturalWidth, image.naturalHeight],
            dataUrl: canvas.toDataURL("image/png"),
          };
        },
        `data:image/jpeg;base64,${bytes.toString("base64")}`,
      );
      const asset: Asset = {
        id: "circle-photo",
        name: "Waterfall with graded alpha",
        mime: "image/png",
        width: 256,
        height: 256,
        dataUrl: prepared.dataUrl,
      };
      const photoSettings = {
        spacing: 12,
        rotation: 30,
        dotSize: 1,
        softness: 1,
        gamma: 1,
        polarity: "shadows",
        foreground: "#103050",
        background: "#fff4d2",
        foregroundOpacity: 1,
        backgroundOpacity: 1,
      };
      const photo = (overrides: Partial<Effect> = {}) =>
        createProject({
          assets: { [asset.id]: asset },
          pages: [
            createPage({
              id: "circle-photo-page",
              width: 256,
              height: 256,
              background: "transparent",
              layers: [
                createLayer("image", {
                  id: "circle-photo-owner",
                  assetId: asset.id,
                  x: 32,
                  y: 32,
                  width: 192,
                  height: 192,
                  effects: [createEffect("circle", { settings: photoSettings, ...overrides })],
                }),
              ],
            }),
          ],
        });
      await load(page, photo({ amount: 0 }));
      const neutral = await png(page, forceWebGL);
      await save("neutral", neutral);
      const project = photo();
      await load(page, project);
      const screened = await png(page, forceWebGL);
      await save("photo", screened);
      const photograph = await inspect(inspection, neutral, screened);
      expect(photograph.rgbMean).toBeGreaterThan(10);
      expect(photograph.alphaMax).toBe(0);
      expect(photograph.alphaLevels).toBeGreaterThan(32);
      expect(photograph.ink).toBeGreaterThan(200);
      expect(photograph.paper).toBeGreaterThan(200);
      const zooms: unknown[] = [];
      for (const zoom of [0.5, 1, 2]) {
        await page.getByTestId("artboard").hover();
        await zoomViewport(page, zoom);
        await ready(page, project.id, 256 * zoom);
        const native = forceWebGL
          ? (await nativeWebGLFrame(page, project.id)).dataUrl
          : await page
              .locator(".editor-gpu-scene canvas")
              .evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png"));
        const exported = await png(page, forceWebGL, zoom);
        await save(`live-${zoom}`, native);
        await save(`export-${zoom}`, exported);
        const metrics = await inspect(inspection, exported, native);
        expect(metrics.reference).toEqual([256 * zoom, 256 * zoom]);
        expect(metrics.candidate).toEqual(metrics.reference);
        expect(metrics.differentBytes).toBe(0);
        zooms.push({ zoom, metrics });
      }
      const enlarged = await inspect(inspection, screened, await png(page, forceWebGL, 2), 2);
      expect(enlarged.differentBytes).toBe(0);
      await load(page, photo({ seed: 9321, time: 250 }));
      expect(
        (await inspect(inspection, screened, await png(page, forceWebGL))).differentBytes,
      ).toBe(0);
      await load(
        page,
        photo({ settings: { ...photoSettings, backgroundOpacity: 0, foregroundOpacity: 0.6 } }),
      );
      const translucent = await png(page, forceWebGL);
      await save("translucent", translucent);
      const coverage = await inspect(inspection, neutral, translucent);
      expect(coverage.expansionMax).toBe(0);
      expect(coverage.alphaMaximum).toBeLessThan(255);
      expect(coverage.alphaLevels).toBeGreaterThan(32);
      await load(
        page,
        photo({ settings: { ...photoSettings, backgroundOpacity: 0, foregroundOpacity: 0 } }),
      );
      const zero = await inspect(inspection, neutral, await png(page, forceWebGL));
      expect(zero.alphaMaximum).toBe(0);
      await load(
        page,
        photo({
          amount: 0,
          settings: { ...photoSettings, backgroundOpacity: 0, foregroundOpacity: 0 },
        }),
      );
      expect((await inspect(inspection, neutral, await png(page, forceWebGL))).differentBytes).toBe(
        0,
      );
      const renderFlat = async (settings: NonNullable<Effect["settings"]>, amount = 1) => {
        await load(page, flat(createEffect("circle", { amount, settings })));
        return png(page, forceWebGL);
      };
      const tones = await renderFlat(flatSettings);
      await save("tones", tones);
      const toneCells = await cells(inspection, tones);
      expect(toneCells.cells[0]!.ink).toBe(0);
      expect(toneCells.cells[1]!.ink).toBeGreaterThan(128);
      expect(toneCells.cells[1]!.ink).toBeLessThan(240);
      expect(toneCells.cells[2]!.ink).toBe(256);
      expect(toneCells.grayCenter).toEqual([0, 0, 0, 255]);
      expect(toneCells.grayCorner).toEqual([255, 255, 255, 255]);
      const inverse = await cells(
        inspection,
        await renderFlat({ ...flatSettings, polarity: "highlights" }),
      );
      expect(inverse.cells[0]!.ink).toBe(256);
      expect(inverse.cells[2]!.ink).toBe(0);
      const gamma = await cells(inspection, await renderFlat({ ...flatSettings, gamma: 2 }));
      expect(gamma.cells[1]!.ink).toBeLessThan(toneCells.cells[1]!.ink);
      const soft = await cells(inspection, await renderFlat({ ...flatSettings, softness: 4 }));
      expect(soft.cells[1]!.intermediate).toBeGreaterThan(32);
      const rotated = await inspect(
        inspection,
        tones,
        await renderFlat({ ...flatSettings, rotation: 30 }),
      );
      expect(rotated.differentBytes).toBeGreaterThan(1000);
      const spacing = await inspect(
        inspection,
        tones,
        await renderFlat({ ...flatSettings, spacing: 8 }),
      );
      expect(spacing.differentBytes).toBeGreaterThan(1000);
      const paper = await renderFlat({
        ...flatSettings,
        dotSize: 0,
        background: "#306090",
        backgroundOpacity: 0.25,
      });
      const paperCells = await cells(inspection, paper);
      expect(paperCells.grayCenter[3]).toBe(64);
      // RGBA8 premultiplication at alpha64 has a straight-color quantum255/64.
      for (let c = 0; c < 3; c++)
        expect(Math.abs(paperCells.grayCenter[c]! - [48, 96, 144][c]!)).toBeLessThanOrEqual(2);
      const half = await cells(
        inspection,
        await renderFlat({ ...flatSettings, backgroundOpacity: 0 }, 0.5),
      );
      expect(half.cells[0]!.alphaMean).toBeCloseTo(128, 0);
      expect(half.cells[2]!.alphaMean).toBe(255);
      for (const edge of [
        { ...flatSettings, spacing: 2, gamma: 0.1 },
        { ...flatSettings, spacing: 256, softness: 16, gamma: 4 },
      ]) {
        const metrics = await cells(inspection, await renderFlat(edge));
        expect(metrics.cells[0]!.ink).toBe(0);
        expect(metrics.cells[2]!.ink).toBe(256);
      }
      const clear = await renderFlat({ ...flatSettings, dotSize: 0, backgroundOpacity: 0 });
      expect((await inspect(inspection, clear, clear)).alphaMaximum).toBe(0);
      const environment = await densityEnvironment(page);
      expect(environment.backend).toBe(forceWebGL ? "webgl" : "webgpu");
      expect(errors).toEqual([]);
      expect({
        gpu: environment.reads.gpu,
        webgl: environment.reads.webgl,
        canvas: environment.reads.canvas,
      }).toEqual({ gpu: 0, webgl: 0, canvas: 0 });
      await writeFile(
        `artifacts/circle/${key}.json`,
        JSON.stringify(
          {
            boundary:
              "True photograph and flat white/gray/black controls. Literal luminance-driven circular radius, independent ink/paper colors and source-bounded opacity, exact neutral amount, deterministic static screen, full RGBA live/export at matched densities; only inspection page decodes PNGs.",
            originalSize: prepared.originalSize,
            photoSettings,
            photograph,
            zooms,
            enlarged,
            coverage,
            zero,
            toneCells,
            inverse,
            gamma,
            soft,
            rotated,
            spacing,
            paperCells,
            half,
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
