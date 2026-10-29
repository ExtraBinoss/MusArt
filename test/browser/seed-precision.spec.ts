import { expect, test } from "@playwright/test";
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
import { imageDifference } from "./support/photographic-effect";
import {
  SEEDED_EFFECTS,
  installSeedLayoutProbe,
  seedPrecisionEffect,
} from "./support/seed-precision";

for (const forceWebGL of [false, true])
  test(`All nine seeded effects retain high uint bits and bounded temporal precision (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const inspection = await page.context().newPage(),
      photo = `data:image/jpeg;base64,${(await readFile("apps/web/public/benchmark/50-waterfall-5.jpg")).toString("base64")}`;
    const dataUrl = await inspection.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0, 128, 128);
      context.globalCompositeOperation = "destination-in";
      const gradient = context.createLinearGradient(0, 0, 128, 128);
      gradient.addColorStop(0, "white");
      gradient.addColorStop(0.5, "white");
      gradient.addColorStop(1, "#ffffff33");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
      return canvas.toDataURL("image/png");
    }, photo);
    const asset: Asset = {
      id: "precision-photo",
      name: "Precision photograph",
      width: 128,
      height: 128,
      mime: "image/png",
      dataUrl,
    };
    await installReadbackProbe(page);
    await installSeedLayoutProbe(page);
    if (forceWebGL)
      await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
    await page.goto("/?automation=1");
    await page.bringToFront();
    await page.waitForFunction(() => Boolean(window.musart));
    const suffix = forceWebGL ? "webgl" : "webgpu",
      high = 2 ** 30;
    await mkdir(`artifacts/seed-precision/${suffix}`, { recursive: true });
    const save = (name: string, src: string) =>
      writeFile(
        `artifacts/seed-precision/${suffix}/${name}.png`,
        Buffer.from(src.split(",")[1]!, "base64"),
      );
    let sequence = 0;
    const render = async (effect: Effect | null) => {
      const project = createProject({
        id: `precision-${suffix}-${++sequence}`,
        assets: { [asset.id]: asset },
        pages: [
          createPage({
            width: 128,
            height: 128,
            background: "transparent",
            layers: [
              createLayer("image", {
                id: "precision-image",
                x: 0,
                y: 0,
                width: 128,
                height: 128,
                assetId: asset.id,
                effects: effect ? [effect] : [],
              }),
            ],
          }),
        ],
      });
      await page.evaluate((project) => window.musart!.load(project), project);
      await page.waitForFunction((id) => {
        const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
        return (
          data?.projectId === id &&
          data.rendererReady === "true" &&
          data.sceneRevision === data.renderedRevision
        );
      }, project.id);
      return page.evaluate(
        (forceWebGL) => window.musart!.render({ format: "png", forceWebGL }),
        forceWebGL,
      );
    };
    const compare = (a: string, b: string) => imageDifference(inspection, a, b);
    const report: Record<string, unknown> = {};
    try {
      const source = await render(null);
      for (const type of SEEDED_EFFECTS) {
        const zero = await render(seedPrecisionEffect(type, 0)),
          large = await render(seedPrecisionEffect(type, high)),
          adjacent = await render(seedPrecisionEffect(type, high + 1)),
          repeat = await render(seedPrecisionEffect(type, high + 1));
        const metrics = {
          highBit: await compare(zero, large),
          lowBit: await compare(large, adjacent),
          repeat: await compare(adjacent, repeat),
          alpha: await compare(source, adjacent),
        };
        report[type] = metrics;
        await save(`${type}-0`, zero);
        await save(`${type}-high`, large);
        await save(`${type}-adjacent`, adjacent);
        await writeFile(
          `artifacts/seed-precision/${suffix}/metrics.json`,
          JSON.stringify(report, null, 2),
        );
        expect(metrics.highBit.differentBytes, `${type} bit30`).toBeGreaterThan(0);
        expect(metrics.lowBit.differentBytes, `${type} low bit at high seed`).toBeGreaterThan(0);
        expect(metrics.repeat.differentBytes, `${type} repeat`).toBe(0);
        expect(metrics.alpha.alphaMax, `${type} original alpha`).toBe(0);
      }
      const pink = seedPrecisionEffect("pink-phosphor", high),
        pink0 = await render(pink),
        pink1 = await render({ ...pink, time: 1 / 30 }),
        pink2 = await render({ ...pink, time: 2 / 30 }),
        seed1 = await render({ ...pink, seed: high + 1 }),
        seed2 = await render({ ...pink, seed: high + 2 });
      const pinkFrames = {
        first: await compare(pink0, pink1),
        second: await compare(pink1, pink2),
        integer1: await compare(seed1, pink1),
        integer2: await compare(seed2, pink2),
      };
      expect(pinkFrames.first.differentBytes).toBeGreaterThan(0);
      expect(pinkFrames.second.differentBytes).toBeGreaterThan(0);
      expect(pinkFrames.integer1.differentBytes).toBe(0);
      expect(pinkFrames.integer2.differentBytes).toBe(0);
      await save("pink-grain-frame0", pink0);
      await save("pink-grain-frame1", pink1);
      await save("pink-grain-frame2", pink2);
      const pinkFlicker = {
          ...pink,
          settings: { ...pink.settings, grain: 0, flicker: 0.3, speed: 8 },
        },
        pinkStart = await render(pinkFlicker),
        pinkEnd = await render({ ...pinkFlicker, time: 86400 }),
        pinkCycles = await compare(pinkStart, pinkEnd);
      expect(pinkCycles.differentBytes).toBe(0);
      const crt = createEffect("crt", {
          seed: high + 1,
          time: 0,
          settings: {
            noise: 0,
            jitter: 0,
            flicker: 0.5,
            flickerRate: 60,
            rollingBar: 1,
            rollingSpeed: 2,
          },
        }),
        crtStart = await render(crt),
        crtEnd = await render({ ...crt, time: 86400 }),
        crtCycles = await compare(crtStart, crtEnd);
      expect(crtCycles.differentBytes).toBe(0);
      expect(crtCycles.alphaMax).toBe(0);
      await save("crt-phase0", crtStart);
      await save("crt-phase86400", crtEnd);
      const layouts = await page.evaluate(() => window.__seedUniformLayouts!),
        reads = await page.evaluate(() => window.__musartVideoReadbacks);
      expect(layouts[forceWebGL ? "glsl" : "wgsl"]).toBeGreaterThan(0);
      expect({ gpu: reads?.gpu, webgl: reads?.webgl, canvas: reads?.canvas }).toEqual({
        gpu: 0,
        webgl: 0,
        canvas: 0,
      });
      report.temporal = { pinkFrames, pinkCycles, crtCycles };
      report.layouts = layouts;
      report.reads = reads;
      await writeFile(
        `artifacts/seed-precision/${suffix}/metrics.json`,
        JSON.stringify(report, null, 2),
      );
    } finally {
      await inspection.close();
    }
  });
