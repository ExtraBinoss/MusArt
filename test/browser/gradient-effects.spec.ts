import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  EFFECT_COMPOSITE_MODES,
  GRADIENT_STYLES,
  GRADIENT_TREATMENTS,
  type Effect,
  type GradientStyle,
  type GradientTreatment,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
const documentFor = (effects: Effect[]) =>
  createProject({
    pages: [
      createPage({
        width: 80,
        height: 64,
        background: "transparent",
        layers: [
          createLayer("rectangle", {
            id: "gradient-field",
            x: 8,
            y: 8,
            width: 64,
            height: 48,
            radius: 0,
            fill: "#4080c080",
            effects,
          }),
        ],
      }),
    ],
  });
const gradient = (
  style: GradientStyle,
  treatment: GradientTreatment = "none",
  patch: Partial<Effect> = {},
) =>
  createEffect("gradient", {
    seed: 23,
    time: 1.25,
    settings: {
      preset: "custom",
      style,
      treatment,
      size: 5,
      grain: 0,
      vignette: 0,
      amplitude: 3,
      frequencyX: 3,
      frequencyY: 2.4,
    },
    ...patch,
  });
async function render(page: Page, effects: Effect[], forceWebGL = false) {
  await page.evaluate((project) => window.musart!.load(project), documentFor(effects));
  return page.evaluate((forceWebGL) => window.musart!.render({ forceWebGL }), forceWebGL);
}
async function decode(inspector: Page, url: string, comparison?: string) {
  return inspector.evaluate(
    async ({ url, comparison }) => {
      const read = async (source: string) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      };
      const data = await read(url),
        colors = new Set<string>();
      let hash = 2166136261,
        error = 0,
        maximum = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
        for (let c = 0; c < 4; c++) hash = Math.imul(hash ^ data[i + c]!, 16777619);
      }
      if (comparison) {
        const other = await read(comparison);
        for (let i = 0; i < data.length; i++) {
          const difference = Math.abs(data[i]! - other[i]!);
          error += difference;
          maximum = Math.max(maximum, difference);
        }
      }
      return {
        hash: hash >>> 0,
        colors: colors.size,
        centerAlpha: data[(32 * 80 + 40) * 4 + 3],
        centerRGB: Array.from(data.slice((32 * 80 + 40) * 4, (32 * 80 + 40) * 4 + 3)),
        outsideAlpha: data[3],
        meanError: error / data.length,
        maximum,
      };
    },
    { url, comparison },
  );
}
test("all seven Gradient fields and texture treatments render deterministically through WebGPU and Three WebGL fallback", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const inspector = await page.context().newPage();
  try {
    const results: Record<string, unknown> = {},
      hashes = new Set<number>();
    for (const style of GRADIENT_STYLES) {
      const effects = [gradient(style)],
        gpu = await render(page, effects),
        gl = await render(page, effects, true);
      const result = await decode(inspector, gpu, gl);
      expect(result.colors, style).toBeGreaterThan(8);
      expect(result.centerAlpha, style).toBe(128);
      expect(result.outsideAlpha, style).toBe(0);
      expect(result.meanError, style).toBeLessThan(2);
      expect(result.maximum, style).toBeLessThanOrEqual(16);
      expect((await decode(inspector, await render(page, effects))).hash, `${style} repeat`).toBe(
        result.hash,
      );
      hashes.add(result.hash);
      results[style] = result;
    }
    expect(hashes.size).toBe(7);
    for (const treatment of GRADIENT_TREATMENTS.filter((value) => value !== "none")) {
      const effects = [createEffect("brightness", { amount: 0.5 }), gradient("silk", treatment)];
      const gpu = await render(page, effects),
        gl = await render(page, effects, true),
        result = await decode(inspector, gpu, gl);
      expect(result.colors, treatment).toBeGreaterThan(2);
      expect(result.centerAlpha, treatment).toBe(128);
      expect(result.outsideAlpha, treatment).toBe(0);
      expect(result.meanError, treatment).toBeLessThan(3);
      results[treatment] = result;
    }
    for (const speed of [0, 2]) {
      const effect = gradient("silk", "none", {
        time: 0,
        settings: { preset: "custom", style: "silk", speed, duration: 8, grain: 0.25 },
      });
      const start = await render(page, [effect]),
        pausedOrLooped = await render(page, [{ ...effect, time: speed === 0 ? 3 : 8 }]);
      expect((await decode(inspector, pausedOrLooped)).hash, `grain clock speed=${speed}`).toBe(
        (await decode(inspector, start)).hash,
      );
    }
    const baseline = await render(page, []),
      bypass = await render(page, [gradient("mesh", "glass", { amount: 0 })]);
    expect((await decode(inspector, bypass)).hash).toBe((await decode(inspector, baseline)).hash);
    const normal = await render(page, [gradient("silk")]);
    const multiply = [gradient("silk", "none", { blendMode: "multiply" })];
    const gpuMultiply = await render(page, multiply),
      glMultiply = await render(page, multiply, true);
    const multiplyResult = await decode(inspector, gpuMultiply, glMultiply);
    expect(multiplyResult.hash).not.toBe((await decode(inspector, normal)).hash);
    expect(multiplyResult.meanError).toBeLessThan(1);
    expect(multiplyResult.centerAlpha).toBe(128);
    results.effectMultiply = multiplyResult;
    const expectedAlpha: Record<(typeof EFFECT_COMPOSITE_MODES)[number], number> = {
      "source-over": 192,
      "destination-over": 192,
      "source-in": 64,
      "destination-in": 64,
      "source-out": 64,
      "destination-out": 64,
      "source-atop": 128,
      "destination-atop": 128,
      xor: 127,
      copy: 128,
      destination: 128,
      clear: 0,
      lighter: 255,
    };
    for (const composite of EFFECT_COMPOSITE_MODES) {
      const effects = [gradient("silk", "none", { composite })];
      const gpu = await render(page, effects),
        gl = await render(page, effects, true);
      const result = await decode(inspector, gpu, gl);
      expect(
        Math.abs(result.centerAlpha! - expectedAlpha[composite]),
        composite,
      ).toBeLessThanOrEqual(1);
      expect(result.outsideAlpha, composite).toBe(0);
      expect(result.meanError, composite).toBeLessThan(1);
      results[`composite:${composite}`] = result;
    }
    const reads = await page.evaluate(() => window.__musartVideoReadbacks);
    expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, webglHook: true, canvasHook: true });
    const environment = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      logicalCpus: navigator.hardwareConcurrency,
      dpr: devicePixelRatio,
      backend:
        document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset.backend,
    }));
    const report = JSON.stringify(
      { browser: page.context().browser()?.version(), environment, reads, results },
      null,
      2,
    );
    await mkdir("artifacts", { recursive: true });
    await writeFile("artifacts/gradient-effects.json", report);
    await test
      .info()
      .attach("gradient-fields-and-treatments", { body: report, contentType: "application/json" });
  } finally {
    await inspector.close();
  }
});
test("soft CSS loading uses one retained renderer and settles without production pixel readbacks", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const canvas = page.locator('.canvas-artboard canvas[data-renderer-ready="true"]');
  await expect(canvas).toBeVisible();
  const before = await canvas.evaluate((element) => ({
    instances: element.dataset.rendererInstances,
    frames: Number(element.dataset.renderFrames),
  }));
  await page.evaluate((project) => window.musart!.load(project), documentFor([gradient("silk")]));
  await expect(canvas).toHaveAttribute("data-composition-prepared", "true");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true");
  expect(await canvas.getAttribute("data-renderer-instances")).toBe(before.instances);
  const settled = await canvas.getAttribute("data-render-frames");
  await page.waitForTimeout(250);
  expect(await canvas.getAttribute("data-render-frames")).toBe(settled);
  const counters = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(counters).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    canvasHook: true,
    webglHook: true,
  });
  await canvas.screenshot({ path: "artifacts/gradient-silk.png" });
});

test("Darker/Lighter Color choose the complete RGB triplet by channel sum and retain the backdrop on ties", async ({
  page,
}) => {
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const inspector = await page.context().newPage();
  try {
    for (const forceWebGL of [false, true])
      for (const [blendMode, fill, expected] of [
        ["darker-color", "#00cc00", [0, 204, 0]],
        ["lighter-color", "#00cc00", [255, 0, 0]],
        ["darker-color", "#00ff00", [255, 0, 0]],
        ["lighter-color", "#00ff00", [255, 0, 0]],
      ] as const) {
        const project = createProject({
          pages: [
            createPage({
              width: 80,
              height: 64,
              background: "#ff0000",
              layers: [
                createLayer("rectangle", {
                  x: 0,
                  y: 0,
                  width: 80,
                  height: 64,
                  radius: 0,
                  fill,
                  blendMode,
                }),
              ],
            }),
          ],
        });
        await page.evaluate((project) => window.musart!.load(project), project);
        const url = await page.evaluate(
          (forceWebGL) => window.musart!.render({ forceWebGL }),
          forceWebGL,
        );
        expect(
          (await decode(inspector, url)).centerRGB,
          `${blendMode}/${fill}/webgl=${forceWebGL}`,
        ).toEqual(expected);
      }
  } finally {
    await inspector.close();
  }
});
