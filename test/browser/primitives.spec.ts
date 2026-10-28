import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject, type Project } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
async function load(page: Page, project: Project) {
  await page.evaluate((project) => window.musart!.load(project), project);
}
async function image(page: Page, forceWebGL = false) {
  return page.evaluate((forceWebGL) => window.musart!.render({ forceWebGL }), forceWebGL);
}
async function compare(inspector: Page, first: string, second: string) {
  return inspector.evaluate(
    async ({ first, second }) => {
      const read = async (url: string) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return {
          pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
          width: canvas.width,
        };
      };
      const a = await read(first),
        b = await read(second);
      let total = 0,
        alpha = 0,
        interior = 0;
      for (let i = 0; i < a.pixels.length; i++) {
        const difference = Math.abs(a.pixels[i]! - b.pixels[i]!);
        total += difference;
        if (i % 4 === 3) alpha += difference;
      }
      for (const [x, y] of [
        [48, 44],
        [100, 44],
        [152, 44],
        [204, 44],
        [48, 108],
        [152, 108],
        [48, 172],
        [204, 172],
      ])
        for (let c = 0; c < 4; c++)
          interior = Math.max(
            interior,
            Math.abs(
              a.pixels[(y! * a.width + x!) * 4 + c]! - b.pixels[(y! * a.width + x!) * 4 + c]!,
            ),
          );
      return { mean: total / a.pixels.length, alpha: alpha / (a.pixels.length / 4), interior };
    },
    { first, second },
  );
}
function fixture() {
  const layers = Array.from({ length: 12 }, (_, index) =>
    createLayer(index % 2 ? "ellipse" : "rectangle", {
      id: `shape-${index}`,
      x: 16 + (index % 4) * 52,
      y: 16 + Math.floor(index / 4) * 64,
      width: 64,
      height: 56,
      rotation: (index % 3) * 15,
      radius: 12,
      strokeWidth: 3,
      fill: ["#ff224499", "#3366ccbb", "#22bb8855"][index % 3]!,
      stroke: "#302080cc",
      opacity: 0.75,
    }),
  );
  layers.splice(
    5,
    0,
    createLayer("rectangle", {
      id: "blend-boundary",
      x: 56,
      y: 35,
      width: 130,
      height: 110,
      fill: "#55bbdd80",
      blendMode: "multiply",
      radius: 0,
    }),
  );
  const group = createLayer("group", {
    id: "isolated-group",
    x: 15,
    y: 172,
    width: 220,
    height: 48,
    opacity: 0.5,
    rotation: 5,
  });
  layers.push(
    group,
    ...Array.from({ length: 3 }, (_, index) =>
      createLayer(index % 2 ? "ellipse" : "rectangle", {
        id: `nested-${index}`,
        parentId: group.id,
        x: index * 62,
        y: 0,
        width: 84,
        height: 48,
        fill: ["#ffaa3399", "#22bbffaa", "#aa3377bb"][index]!,
        radius: 8,
      }),
    ),
  );
  return createProject({
    pages: [createPage({ width: 256, height: 224, background: "transparent", layers })],
  });
}
test("instanced primitive runs preserve paint/order/rotation/stroke/opacity/group isolation on both Three backends", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const inspector = await page.context().newPage(),
    fast = fixture(),
    reference = {
      ...fast,
      pages: fast.pages.map((composition) => ({
        ...composition,
        layers: composition.layers.map((layer) =>
          layer.blendMode === "normal" && (layer.kind === "rectangle" || layer.kind === "ellipse")
            ? { ...layer, effects: [createEffect("brightness", { amount: 0.5 })] }
            : layer,
        ),
      })),
    };
  const results: Record<string, unknown> = {};
  try {
    let gpu: string | undefined;
    for (const forceWebGL of [false, true]) {
      await load(page, fast);
      const output = await image(page, forceWebGL);
      await load(page, reference);
      const exact = await image(page, forceWebGL),
        result = await compare(inspector, output, exact);
      expect(result.mean).toBeLessThan(4);
      expect(result.alpha).toBeLessThan(2);
      expect(result.interior).toBeLessThanOrEqual(4);
      results[forceWebGL ? "webgl" : "webgpu"] = result;
      if (gpu) {
        const parity = await compare(inspector, output, gpu);
        expect(parity.mean).toBeLessThan(1);
        results.parity = parity;
      } else gpu = output;
    }
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
      canvasHook: true,
      webglHook: true,
    });
    await mkdir("artifacts", { recursive: true });
    await writeFile("artifacts/primitives-pixels.json", JSON.stringify(results, null, 2));
  } finally {
    await inspector.close();
  }
});
test("ten thousand primitives reach a retained real GPU frame with bounded targets and one draw per composition", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const canvas = page.locator(".canvas-artboard canvas");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true");
  const before = JSON.parse((await canvas.getAttribute("data-gpu-stats"))!);
  const layers = Array.from({ length: 10_000 }, (_, index) =>
    createLayer(index % 2 ? "ellipse" : "rectangle", {
      id: `load-${index}`,
      x: (index % 100) * 40,
      y: Math.floor(index / 100) * 40,
      width: 32,
      height: 32,
      fill: `#${((index * 1237) % 0xffffff).toString(16).padStart(6, "0")}cc`,
      radius: 4,
    }),
  );
  const project = createProject({
      pages: [createPage({ id: "ten-thousand-instances", width: 4000, height: 4000, layers })],
    }),
    start = Date.now();
  await load(page, project);
  await expect(canvas).toHaveAttribute("data-page-id", "ten-thousand-instances");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true");
  const loadMs = Date.now() - start,
    stats = JSON.parse((await canvas.getAttribute("data-gpu-stats"))!);
  expect(loadMs).toBeLessThan(10_000);
  expect(stats.primitiveDraws - before.primitiveDraws).toBeLessThanOrEqual(3);
  expect(stats.primitiveInstances - before.primitiveInstances).toBeGreaterThanOrEqual(10_000);
  expect(stats.targets).toBeLessThanOrEqual(before.targets + 2);
  expect(stats.primitiveBytes).toBeLessThan(2_000_000);
  expect(stats.uploads).toBe(before.uploads);
  expect(stats.readbacks).toBe(0);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/primitives-10000.json",
    JSON.stringify(
      { loadMs, before, stats, browser: page.context().browser()?.version() },
      null,
      2,
    ),
  );
  await canvas.screenshot({ path: "artifacts/primitives-10000.png", animations: "disabled" });
});
