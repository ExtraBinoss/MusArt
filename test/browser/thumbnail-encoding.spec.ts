import { expect, test, type Locator } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { inspectImage } from "./support/image-probe";

declare global {
  interface Window {
    __thumbnailEncoding?: {
      pending: number;
      maximum: number;
      canvases: number;
      calls: {
        start: number;
        returnedAt: number;
        nativeCallbackAt: number;
        deliveredAt: number;
        width: number;
        height: number;
      }[];
    };
  }
}
async function encoded(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await image.evaluate((node) => (node as HTMLImageElement).decode());
  return image.evaluate(async (node) => {
    const blob = await fetch((node as HTMLImageElement).src).then((response) => response.blob());
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(Error("Missing encoded image."));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  });
}

test("two delayed native thumbnail encodes retain independent solid, effect and mask pixels on one reused GPU canvas", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    const probe = {
      pending: 0,
      maximum: 0,
      canvases: 0,
      calls: [] as NonNullable<Window["__thumbnailEncoding"]>["calls"],
    };
    window.__thumbnailEncoding = probe;
    const canvases = new WeakSet<HTMLCanvasElement>();
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      if (Math.max(this.width, this.height) !== 96)
        return original.call(this, callback, type, quality);
      if (!canvases.has(this)) {
        canvases.add(this);
        probe.canvases++;
      }
      probe.maximum = Math.max(probe.maximum, ++probe.pending);
      const call = {
        start: performance.now(),
        returnedAt: 0,
        nativeCallbackAt: 0,
        deliveredAt: 0,
        width: this.width,
        height: this.height,
      };
      probe.calls.push(call);
      original.call(
        this,
        (blob) => {
          call.nativeCallbackAt = performance.now();
          // This correctness fixture deliberately delays delivery after real native
          // encoding, so another frame resizes/repaints the shared canvas first.
          // Performance cohorts use the unmodified native callback timing.
          setTimeout(() => {
            call.deliveredAt = performance.now();
            probe.pending--;
            callback(blob);
          }, 25);
        },
        type,
        quality,
      );
      call.returnedAt = performance.now();
    };
  });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const originals = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 64, 64);
    gradient.addColorStop(0, "#00d4e5");
    gradient.addColorStop(1, "#f0389e");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    const image = canvas.toDataURL("image/png");
    context.fillStyle = "#000000";
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 32, 64);
    return { image, mask: canvas.toDataURL("image/png") };
  });
  const owner = createLayer("image", {
    id: "encoding-owner",
    name: "Encoding owner",
    x: 0,
    y: 0,
    width: 64,
    height: 64,
    assetId: "encoding-original",
    effects: [
      createEffect("dither", {
        id: "encoding-dither",
        amount: 1,
        scale: 2,
        levels: 2,
        color: false,
      }),
      createEffect("brightness", { id: "encoding-brightness", amount: 0.8 }),
    ],
    mask: { assetId: "encoding-matte", mode: "luminance", enabled: true, inverted: false },
  });
  const board = createPage({
    id: "encoding-board",
    width: 128,
    height: 128,
    layers: [
      owner,
      createLayer("rectangle", {
        id: "encoding-red",
        x: 80,
        y: 0,
        width: 24,
        height: 48,
        fill: "#ff0000",
      }),
      createLayer("rectangle", {
        id: "encoding-blue",
        x: 0,
        y: 80,
        width: 48,
        height: 24,
        fill: "#0000ff",
      }),
    ],
  });
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [board],
      assets: {
        "encoding-original": {
          id: "encoding-original",
          name: "Gradient",
          width: 64,
          height: 64,
          mime: "image/png",
          dataUrl: originals.image,
        },
        "encoding-matte": {
          id: "encoding-matte",
          name: "Half mask",
          width: 64,
          height: 64,
          mime: "image/png",
          dataUrl: originals.mask,
        },
      },
    }),
  );
  const ownerRow = page.locator('.layer-row[data-layer-id="encoding-owner"]');
  const images = {
    red: await encoded(
      page.locator('.layer-row[data-layer-id="encoding-red"] [data-thumbnail-variant="layer"] img'),
    ),
    blue: await encoded(
      page.locator(
        '.layer-row[data-layer-id="encoding-blue"] [data-thumbnail-variant="layer"] img',
      ),
    ),
    main: await encoded(ownerRow.locator('[data-thumbnail-variant="layer"] img')),
    effect: await encoded(ownerRow.locator('[data-thumbnail-effect-id="encoding-dither"] img')),
    mask: await encoded(ownerRow.locator('[data-thumbnail-variant="mask"] img')),
  };
  await page.waitForFunction(() => window.__thumbnailEncoding!.pending === 0);
  const probe = await page.evaluate(() => window.__thumbnailEncoding!);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
  const inspection = await page.context().newPage();
  try {
    const solids = await inspection.evaluate(
      async (values) => {
        const results: Record<string, { width: number; height: number; rgba: number[] }> = {};
        for (const [name, src] of Object.entries(values)) {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d")!;
          context.drawImage(image, 0, 0);
          results[name] = {
            width: image.width,
            height: image.height,
            rgba: [...context.getImageData(image.width / 2, image.height / 2, 1, 1).data],
          };
        }
        return results;
      },
      { red: images.red, blue: images.blue },
    );
    const regions = [
      { x: 0.1, y: 0.2, width: 0.25, height: 0.6 },
      { x: 0.65, y: 0.2, width: 0.25, height: 0.6 },
    ];
    const main = await inspectImage(page, images.main, regions, inspection);
    const effect = await inspectImage(page, images.effect, regions, inspection);
    const mask = await inspectImage(page, images.mask, regions, inspection);
    await mkdir("artifacts", { recursive: true });
    await writeFile(
      "artifacts/thumbnail-encoding.json",
      JSON.stringify({ solids, main, effect, mask, probe, reads, errors }, null, 2),
    );
    expect(solids.red).toMatchObject({ width: 48, height: 96 });
    expect(solids.blue).toMatchObject({ width: 96, height: 48 });
    expect(solids.red!.rgba[0]).toBeGreaterThan(245);
    expect(solids.red!.rgba[2]).toBeLessThan(8);
    expect(solids.blue!.rgba[2]).toBeGreaterThan(245);
    expect(solids.blue!.rgba[0]).toBeLessThan(8);
    expect(main).toMatchObject({ width: 96, height: 96 });
    expect(main.regions[0]!.opaque).toBe(1);
    expect(main.regions[1]!.opaque).toBe(0);
    expect(effect.regions[0]!.hash).not.toBe(main.regions[0]!.hash);
    expect(mask.regions.every((region) => region.opaque === 1 && region.colors === 1)).toBe(true);
    expect(mask.regions[0]!.hash).not.toBe(mask.regions[1]!.hash);
    expect(probe.maximum).toBe(2);
    expect(probe.canvases).toBe(1);
    expect(
      probe.calls.some((call, index) =>
        probe.calls.slice(index + 1).some((next) => next.start < call.deliveredAt),
      ),
    ).toBe(true);
    expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    expect(errors).toEqual([]);
  } finally {
    await inspection.close();
  }
});
