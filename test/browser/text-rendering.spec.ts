import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createEffect, createLayer, createPage, createProject, type Layer } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
import { zoomViewport } from "./support/viewport";

interface Decoded {
  width: number;
  height: number;
  data: number[];
}
declare global {
  interface Window {
    __musartTextRasterCalls?: string[];
  }
}
async function decode(inspector: Page, url: string): Promise<Decoded> {
  return inspector.evaluate(async (url) => {
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
      data: Array.from(context.getImageData(0, 0, image.width, image.height).data),
    };
  }, url);
}
/** Scan high-resolution exports locally; do not serialize millions of pixel scalars into traces. */
async function sharpWitness(inspector: Page, url: string) {
  return inspector.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, image.width, image.height).data;
    let left = image.width,
      right = -1,
      top = image.height,
      bottom = -1,
      count = 0;
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++) {
        if (data[(y * image.width + x) * 4]! >= 230) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        count++;
      }
    const row = Math.floor((top + bottom) / 2);
    let edgePixels = 0;
    for (let x = 0; x < image.width; x++) {
      const value = data[(row * image.width + x) * 4]!;
      if (value > 10 && value < 245) edgePixels++;
    }
    return {
      width: image.width,
      height: image.height,
      count,
      left,
      right,
      top,
      bottom,
      edgePixels,
      background: Array.from(data.slice(0, 4)),
    };
  }, url);
}
async function load(
  page: Page,
  layers: Layer[],
  width = 320,
  height = 180,
  background = "transparent",
) {
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ pages: [createPage({ width, height, background, layers })] }),
  );
}
async function render(page: Page, inspector: Page, forceWebGL: boolean, scale = 1) {
  return decode(
    inspector,
    await page.evaluate((options) => window.musart!.render(options), { forceWebGL, scale }),
  );
}
function rgba(output: Decoded, x: number, y: number) {
  return output.data.slice((y * output.width + x) * 4, (y * output.width + x) * 4 + 4);
}
function ink(output: Decoded) {
  let left = output.width,
    right = -1,
    top = output.height,
    bottom = -1,
    count = 0;
  const rows = new Set<number>();
  for (let y = 0; y < output.height; y++)
    for (let x = 0; x < output.width; x++) {
      const offset = (y * output.width + x) * 4;
      if (output.data[offset + 3]! < 230) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      rows.add(y);
      count++;
    }
  let bands = 0,
    previous = -2;
  for (const row of rows) {
    if (row > previous + 1) bands++;
    previous = row;
  }
  return {
    left,
    right,
    top,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
    count,
    bands,
  };
}
function maxAlpha(output: Decoded) {
  let maximum = 0;
  for (let offset = 3; offset < output.data.length; offset += 4)
    maximum = Math.max(maximum, output.data[offset]!);
  return maximum;
}
function hash(output: Decoded) {
  return (
    output.data.reduce((value, channel) => Math.imul(value ^ channel, 16777619), 2166136261) >>> 0
  );
}
function samePixels(actual: Decoded, expected: Decoded, description: string) {
  expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);
  expect(
    actual.data.findIndex((value, index) => value !== expected.data[index]),
    description,
  ).toBe(-1);
}
function opaquePoints(output: Decoded) {
  const points: { x: number; y: number }[] = [];
  for (let y = 0; y < output.height; y++)
    for (let x = 0; x < output.width; x++)
      if (output.data[(y * output.width + x) * 4 + 3] === 255) points.push({ x, y });
  return points;
}
function mean(output: Decoded, points: { x: number; y: number }[]) {
  const sums = [0, 0, 0, 0];
  for (const point of points)
    rgba(output, point.x, point.y).forEach((value, index) => {
      sums[index]! += value;
    });
  return sums.map((value) => value / points.length);
}
function text(patch: Partial<Layer> = {}) {
  return createLayer("text", {
    id: "text-witness",
    text: "O",
    x: 16,
    y: 8,
    width: 280,
    height: 160,
    fontFamily: "Inter",
    fontWeight: 400,
    fontSize: 124,
    lineHeight: 1.2,
    letterSpacing: 0,
    fill: "#2563eb",
    ...patch,
  });
}
async function assertNoRasterOrReads(page: Page) {
  const probes = await page.evaluate(() => ({
    reads: window.__musartVideoReadbacks!,
    raster: window.__musartTextRasterCalls!,
  }));
  expect(probes.reads.gpuHook && probes.reads.webglHook && probes.reads.canvasHook).toBe(true);
  expect({ gpu: probes.reads.gpu, webgl: probes.reads.webgl, canvas: probes.reads.canvas }).toEqual(
    { gpu: 0, webgl: 0, canvas: 0 },
  );
  expect(probes.raster).toEqual([]);
  return probes;
}

for (const forceWebGL of [false, true]) {
  const backend = forceWebGL ? "WebGL-fallback" : "WebGPU";
  test(`analytical text ${backend}: curves, paint, layout, composition and sharp native exports`, async ({
    page,
  }) => {
    test.setTimeout(240000);
    await installReadbackProbe(page);
    await page.addInitScript(() => {
      const calls: string[] = [];
      window.__musartTextRasterCalls = calls;
      for (const method of ["fillText", "strokeText"] as const) {
        const original = CanvasRenderingContext2D.prototype[method];
        CanvasRenderingContext2D.prototype[method] = function (
          ...args: Parameters<typeof original>
        ) {
          calls.push(String(args[0]));
          return Reflect.apply(original, this, args);
        };
      }
    });
    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    const inspector = await page.context().newPage();
    try {
      // The round counter must stay transparent, with both oriented contours visible.
      await load(page, [text()]);
      const solid = await render(page, inspector, forceWebGL),
        bounds = ink(solid);
      expect(bounds.count).toBeGreaterThan(500);
      const center = {
        x: Math.round((bounds.left + bounds.right) / 2),
        y: Math.round((bounds.top + bounds.bottom) / 2),
      };
      expect(rgba(solid, center.x, center.y)[3]).toBe(0);
      const middle = Array.from(
        { length: bounds.width },
        (_, offset) => rgba(solid, bounds.left + offset, center.y)[3]!,
      );
      await mkdir("artifacts", { recursive: true });
      await writeFile(
        `artifacts/text-initial-${backend}.json`,
        JSON.stringify({ bounds, center, middle }, null, 2),
      );
      expect(bounds.width).toBeGreaterThan(bounds.height * 0.65);
      expect(bounds.width).toBeLessThan(bounds.height * 1.15);
      expect(middle.filter((alpha) => alpha > 250).length).toBeGreaterThan(8);
      expect(
        middle
          .slice(Math.floor(middle.length * 0.3), Math.ceil(middle.length * 0.7))
          .every((alpha) => alpha === 0),
      ).toBe(true);
      const witness = opaquePoints(solid)[0]!;
      expect(rgba(solid, witness.x, witness.y)).toEqual([37, 99, 235, 255]);
      expect(rgba(solid, 0, 0)[3]).toBe(0);
      await load(page, [text({ fill: "#2563eb80", opacity: 0.5 })]);
      const translucent = await render(page, inspector, forceWebGL);
      expect(maxAlpha(translucent)).toBe(64);
      rgba(translucent, witness.x, witness.y)
        .slice(0, 3)
        .forEach((value, index) =>
          expect(Math.abs(value - [37, 99, 235][index]!)).toBeLessThanOrEqual(4),
        );
      await load(page, [
        text({ text: "HH", fontSize: 100, fill: "#2563eb80", letterSpacing: -60 }),
      ]);
      expect(maxAlpha(await render(page, inspector, forceWebGL))).toBe(128);

      // Paint interpolates in layer coordinates, including per-stop alpha and hard edges.
      const painted = text({ text: "MMM", width: 288 });
      await load(page, [painted]);
      const reference = await render(page, inspector, forceWebGL),
        points = opaquePoints(reference),
        referenceBounds = ink(reference);
      const left = points.filter(
          (point) => point.x < referenceBounds.left + referenceBounds.width * 0.2,
        ),
        right = points.filter(
          (point) => point.x > referenceBounds.right - referenceBounds.width * 0.2,
        );
      const stops = [
        { offset: 0, color: "#ff0000" },
        { offset: 1, color: "#0000ff" },
      ];
      await load(page, [{ ...painted, fillGradient: { kind: "linear", angle: 0, stops } }]);
      const linear = await render(page, inspector, forceWebGL),
        linearLeft = mean(linear, left),
        linearRight = mean(linear, right);
      expect(linearLeft[0]!).toBeGreaterThan(linearLeft[2]! + 40);
      expect(linearRight[2]!).toBeGreaterThan(linearRight[0]! + 40);
      const ordered = [...points].sort(
          (a, b) =>
            Math.hypot(
              (a.x - painted.x) / painted.width - 0.5,
              (a.y - painted.y) / painted.height - 0.5,
            ) -
            Math.hypot(
              (b.x - painted.x) / painted.width - 0.5,
              (b.y - painted.y) / painted.height - 0.5,
            ),
        ),
        sampleSize = Math.max(1, Math.floor(points.length * 0.05));
      await load(page, [{ ...painted, fillGradient: { kind: "radial", angle: 0, stops } }]);
      const radial = await render(page, inspector, forceWebGL),
        near = mean(radial, ordered.slice(0, sampleSize)),
        far = mean(radial, ordered.slice(-sampleSize));
      expect(near[0]!).toBeGreaterThan(far[0]! + 40);
      expect(far[2]!).toBeGreaterThan(near[2]! + 40);
      await load(page, [
        {
          ...painted,
          fillGradient: {
            kind: "linear",
            angle: 0,
            stops: [
              { offset: 0, color: "#ff000040" },
              { offset: 1, color: "#0000ffc0" },
            ],
          },
        },
      ]);
      const alphaGradient = await render(page, inspector, forceWebGL);
      expect(mean(alphaGradient, right)[3]!).toBeGreaterThan(mean(alphaGradient, left)[3]! + 40);
      await load(page, [
        {
          ...painted,
          fillGradient: {
            kind: "linear",
            angle: 0,
            stops: [
              stops[0]!,
              { offset: 0.5, color: "#ff0000" },
              { offset: 0.5, color: "#0000ff" },
              stops[1]!,
            ],
          },
        },
      ]);
      const hard = await render(page, inspector, forceWebGL),
        colors = new Set(points.map((point) => rgba(hard, point.x, point.y).join(",")));
      expect([...colors].sort()).toEqual(["0,0,255,255", "255,0,0,255"]);

      // Font choice, true advances, tracking, weight and wrapping change geometry.
      const layout = text({ text: "AVATAR", fontSize: 64, width: 300 });
      await load(page, [layout]);
      const normal = await render(page, inspector, forceWebGL),
        normalBounds = ink(normal);
      await load(page, [{ ...layout, letterSpacing: 8 }]);
      const tracked = ink(await render(page, inspector, forceWebGL));
      expect(tracked.width - normalBounds.width).toBeCloseTo(40, 0);
      await load(page, [{ ...layout, fontWeight: 800 }]);
      expect(ink(await render(page, inspector, forceWebGL)).count).toBeGreaterThan(
        normalBounds.count * 1.15,
      );
      await load(page, [{ ...layout, fontFamily: "Tinos" }]);
      const serif = await render(page, inspector, forceWebGL);
      expect(hash(serif)).not.toBe(hash(normal));
      await load(page, [{ ...layout, fontFamily: "Georgia" }]);
      samePixels(
        await render(page, inspector, forceWebGL),
        serif,
        "Georgia aliases the local Tinos outlines",
      );
      const pair = text({ fontFamily: "Tinos", text: "A", fontSize: 96 });
      await load(page, [pair]);
      const widthA = ink(await render(page, inspector, forceWebGL)).width;
      await load(page, [{ ...pair, text: "V" }]);
      const widthV = ink(await render(page, inspector, forceWebGL)).width;
      await load(page, [{ ...pair, text: "AV" }]);
      const kernedWidth = ink(await render(page, inspector, forceWebGL)).width;
      expect(kernedWidth).toBeLessThan(widthA + widthV - 2);
      const paragraph = text({
        text: "ONE TWO THREE FOUR",
        fontSize: 28,
        lineHeight: 1.5,
        width: 300,
      });
      await load(page, [paragraph], 340, 220);
      const wide = ink(await render(page, inspector, forceWebGL));
      await load(page, [{ ...paragraph, width: 105 }], 340, 220);
      const wrapped = ink(await render(page, inspector, forceWebGL));
      expect(wrapped.bands).toBeGreaterThan(wide.bands);
      expect(wrapped.height).toBeGreaterThan(wide.height + 30);
      await load(page, [text({ text: "Été à Noël", fontSize: 42 })]);
      expect(ink(await render(page, inspector, forceWebGL)).count).toBeGreaterThan(500);
      await load(page, [text({ text: "Café", fontSize: 64 })]);
      const composedAccent = await render(page, inspector, forceWebGL);
      await load(page, [text({ text: "Cafe\u0301", fontSize: 64 })]);
      samePixels(
        await render(page, inspector, forceWebGL),
        composedAccent,
        "NFC-equivalent text has identical pixels",
      );
      await load(page, [text({ text: "I", fontSize: 84, height: 40 })]);
      const clippedLine = ink(await render(page, inspector, forceWebGL));
      expect(clippedLine.count).toBeGreaterThan(10);
      expect(clippedLine.bottom).toBeLessThanOrEqual(47);

      // Text uses the same mask/effect/group/blend graph as neighboring artwork.
      const maskedText = text({
          text: "MMMM",
          width: 288,
          fontSize: 100,
          x: 0,
          y: 0,
          mask: { layerId: "text-mask", enabled: true, inverted: false, mode: "alpha" },
        }),
        mask = createLayer("rectangle", {
          id: "text-mask",
          maskSource: true,
          x: 0,
          y: 0,
          width: 144,
          height: 180,
          fill: "#ffffff",
          radius: 0,
        });
      await load(page, [maskedText, mask]);
      const masked = await render(page, inspector, forceWebGL);
      expect(ink(masked).count).toBeGreaterThan(500);
      const maskedWitness = opaquePoints(masked)[0]!;
      expect(rgba(masked, maskedWitness.x, maskedWitness.y)).toEqual([37, 99, 235, 255]);
      let outsideMask = 0;
      for (let y = 0; y < masked.height; y++)
        for (let x = 144; x < masked.width; x++)
          outsideMask = Math.max(outsideMask, masked.data[(y * masked.width + x) * 4 + 3]!);
      expect(outsideMask).toBe(0);
      await load(page, [text({ effects: [createEffect("invert", { amount: 1 })] })]);
      const inverted = await render(page, inspector, forceWebGL);
      expect(rgba(inverted, witness.x, witness.y)).toEqual([218, 156, 20, 255]);
      expect(rgba(inverted, center.x, center.y)[3]).toBe(0);
      const underlay = createLayer("rectangle", {
        id: "underlay",
        x: 0,
        y: 0,
        width: 320,
        height: 180,
        fill: "#40a080",
        radius: 0,
      });
      await load(page, [underlay, text({ fill: "#ff0080", blendMode: "multiply" })]);
      expect(rgba(await render(page, inspector, forceWebGL), witness.x, witness.y)).toEqual([
        64, 0, 64, 255,
      ]);
      const group = createLayer("group", {
        id: "text-group",
        x: 0,
        y: 0,
        width: 320,
        height: 180,
        opacity: 0.5,
      });
      await load(page, [group, text({ parentId: group.id, fill: "#2563eb80" })]);
      expect(maxAlpha(await render(page, inspector, forceWebGL))).toBe(64);

      // High resolution rendering has a narrow coverage edge, rather than enlarging a bitmap.
      await load(
        page,
        [
          text({
            text: "I",
            x: 30.25,
            y: 4,
            width: 100,
            height: 110,
            fontSize: 84,
            fill: "#000000",
          }),
        ],
        192,
        128,
        "#ffffff",
      );
      const high = await sharpWitness(
        inspector,
        await page.evaluate((options) => window.musart!.render(options), { forceWebGL, scale: 4 }),
      );
      expect([high.width, high.height]).toEqual([768, 512]);
      expect(high.count).toBeGreaterThan(1000);
      expect(high.count).toBeLessThan(high.width * high.height * 0.2);
      expect(high.background).toEqual([255, 255, 255, 255]);
      expect(high.edgePixels).toBeGreaterThan(0);
      expect(high.edgePixels).toBeLessThanOrEqual(4);
      if (!forceWebGL) {
        await page.getByRole("button", { name: "100 % · Recentrer", exact: true }).click();
        const canvas = page.getByTestId("editor-canvas");
        await canvas.hover({ position: { x: 400, y: 300 } });
        await zoomViewport(page, 4);
        const gpu = page.locator('.canvas-artboard canvas[data-renderer-ready="true"]');
        await expect
          .poll(async () => Number(await gpu.getAttribute("data-render-width")))
          .toBe(768);
        const preview = await sharpWitness(
          inspector,
          await gpu.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png")),
        );
        expect([preview.width, preview.height]).toEqual([768, 512]);
        expect(preview.count).toBeGreaterThan(1000);
        expect(preview.count).toBeLessThan(preview.width * preview.height * 0.2);
        expect(preview.background).toEqual([255, 255, 255, 255]);
        expect(preview.edgePixels).toBeGreaterThan(0);
        expect(preview.edgePixels).toBeLessThanOrEqual(4);
        await page.setViewportSize({ width: 1500, height: 920 });
        await expect
          .poll(async () => Number(await gpu.getAttribute("data-render-width")))
          .toBe(768);
        await expect
          .poll(async () => gpu.evaluate((canvas) => (canvas as HTMLCanvasElement).width))
          .toBe(768);
        const resized = await sharpWitness(
          inspector,
          await gpu.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL("image/png")),
        );
        expect([resized.width, resized.height]).toEqual([768, 512]);
        expect(resized.edgePixels).toBeGreaterThan(0);
        expect(resized.edgePixels).toBeLessThanOrEqual(4);
        await page.screenshot({ path: "artifacts/screenshots/text-sharp-zoom.png" });
      }
      const probes = await assertNoRasterOrReads(page);
      await mkdir("artifacts", { recursive: true });
      await writeFile(
        `artifacts/text-rendering-${backend}.json`,
        JSON.stringify(
          {
            backend,
            browser: page.context().browser()!.version(),
            bounds,
            layout: {
              normal: normalBounds,
              tracked,
              wrapped,
              kerning: { widthA, widthV, kernedWidth },
            },
            paint: { linearLeft, linearRight, radialNear: near, radialFar: far },
            export: high,
            probes,
          },
          null,
          2,
        ),
      );
    } finally {
      await inspector.close();
    }
  });
}
